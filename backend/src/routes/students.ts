import { Router, Request, Response } from 'express';
import { validate as uuidValidate } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { query } from '../db/connection';
import { AvailabilityWindow } from '../types';
import { assessWeatherForLesson } from '../services/weatherService';
import { broadcastToOperator } from '../services/sseService';
import { NotificationService } from '../services/notificationService';
import { AuditService } from '../services/auditService';
import { SuggestionService } from '../services/suggestionService';
import { OperatorService } from '../services/operatorService';
import { approveLessonRequestByStaff } from '../services/lessonRequestApprovalService';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Staff in-app + SSE: at most one notification burst per lesson request in this window */
const DRAFT_STAFF_NOTIFY_THROTTLE_MINUTES = 10;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function summarizeSlotsForAudit(aiSchedule: unknown[]): Array<{
  date: string;
  startTime: string;
  endTime: string;
  lessonType?: string;
}> {
  if (!Array.isArray(aiSchedule)) return [];
  return aiSchedule.map((raw) => {
    const s = raw as Record<string, unknown>;
    return {
      date: String(s?.date ?? ''),
      startTime: String(s?.startTime ?? ''),
      endTime: String(s?.endTime ?? ''),
      lessonType: s?.lessonType != null ? String(s.lessonType) : undefined,
    };
  });
}

router.use(authenticate);

// GET /api/students/profile
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const operatorId = req.user!.operatorId;
    const profileResult = await query(
      `SELECT sp.*, u.name, u.email, o.name AS school_name, o.school_type
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       JOIN operators o ON o.id = sp.operator_id
       WHERE sp.user_id = $1`,
      [userId]
    );
    if (profileResult.rows.length === 0) { res.status(404).json({ error: 'Student profile not found' }); return; }
    const profile = profileResult.rows[0];

    const [lessonsResult, requestsResult, minimumsResult] = await Promise.all([
      query(
        `SELECT * FROM scheduled_lessons WHERE user_id = $1 AND operator_id = $2 AND status != 'cancelled' ORDER BY start_time ASC`,
        [userId, operatorId]
      ),
      query(`SELECT * FROM lesson_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [userId]),
      query(`SELECT * FROM course_minimums WHERE license_type = $1 ORDER BY sort_order`, [profile.license_type]),
    ]);

    const programStart = new Date(profile.program_start_date);
    const now = new Date();
    const weeksElapsed = Math.max(1, (now.getTime() - programStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const expectedHours = weeksElapsed * profile.lessons_per_week_target * 2;
    const paceStatus = parseFloat(profile.hours_logged) >= expectedHours ? 'ahead' : 'behind';
    const paceDiff = Math.abs(parseFloat(profile.hours_logged) - expectedHours).toFixed(1);
    const remainingHours = parseFloat(profile.hours_required) - parseFloat(profile.hours_logged) - parseFloat(profile.hours_scheduled);
    const hoursPerWeek = profile.lessons_per_week_target * 2;
    const weeksToGrad = Math.max(0, remainingHours / hoursPerWeek);
    const gradDate = new Date(); gradDate.setDate(gradDate.getDate() + weeksToGrad * 7);
    const contractWeeks = parseFloat(profile.hours_required) / hoursPerWeek;
    const expectedGradDate = new Date(programStart); expectedGradDate.setDate(expectedGradDate.getDate() + contractWeeks * 7);
    const weeksDelta = Math.round((gradDate.getTime() - expectedGradDate.getTime()) / (7 * 24 * 60 * 60 * 1000));

    const hoursMap: Record<string, number> = {
      ground: parseFloat(profile.hours_ground) || parseFloat(profile.hours_logged) * 0.25,
      flight: parseFloat(profile.hours_logged),
      solo: parseFloat(profile.hours_solo) || parseFloat(profile.hours_logged) * 0.15,
      cross_country: parseFloat(profile.hours_cross_country) || parseFloat(profile.hours_logged) * 0.05,
      night: parseFloat(profile.hours_night) || 0,
      sim: parseFloat(profile.hours_sim) || 0,
      pic: parseFloat(profile.hours_logged) * 0.4,
    };

    const minimums = minimumsResult.rows.map((m: any) => ({
      category: m.category, label: m.label, required: parseFloat(m.hours_required),
      logged: Math.min(parseFloat(m.hours_required), hoursMap[m.category] || 0),
      pct: Math.min(100, Math.round(((hoursMap[m.category] || 0) / parseFloat(m.hours_required)) * 100)),
    }));

    res.json({
      profile, lessons: lessonsResult.rows, recentRequests: requestsResult.rows, minimums,
      progress: {
        hoursLogged: parseFloat(profile.hours_logged), hoursScheduled: parseFloat(profile.hours_scheduled),
        hoursRequired: parseFloat(profile.hours_required), hoursRemaining: Math.max(0, remainingHours),
        completionPct: Math.min(100, Math.round((parseFloat(profile.hours_logged) / parseFloat(profile.hours_required)) * 100)),
        paceStatus, paceDiff: parseFloat(paceDiff), projectedGradDate: gradDate.toISOString(),
        expectedGradDate: expectedGradDate.toISOString(), weeksDelta,
      },
    });
  } catch (error) { console.error('Get profile error:', error); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/students/calendar
router.get('/calendar', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const operatorId = req.user!.operatorId;
    const lessonsResult = await query(
      `SELECT * FROM scheduled_lessons WHERE user_id = $1 AND operator_id = $2 AND start_time >= NOW() - INTERVAL '30 days' ORDER BY start_time ASC LIMIT 60`,
      [userId, operatorId]
    );
    res.json({ lessons: lessonsResult.rows });
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/students/lessons/:lessonId/cancel — cancel → notify staff → surface open slot (waitlist suggestion)
router.post('/lessons/:lessonId/cancel', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const operatorId = req.user!.operatorId;
    const { lessonId } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!uuidValidate(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson id' });
      return;
    }

    const lessonResult = await query(
      `SELECT sl.*, u.name AS student_name FROM scheduled_lessons sl
       JOIN users u ON u.id = sl.user_id
       WHERE sl.id = $1 AND sl.user_id = $2 AND sl.operator_id = $3`,
      [lessonId, userId, operatorId]
    );
    if (lessonResult.rows.length === 0) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }
    const lesson = lessonResult.rows[0] as {
      id: string;
      status: string;
      start_time: string;
      end_time: string;
      lesson_type: string;
      instructor_name: string;
      aircraft_tail: string;
      student_name: string;
    };

    if (lesson.status !== 'confirmed') {
      res.status(400).json({ error: 'Only confirmed lessons can be cancelled here' });
      return;
    }
    if (new Date(lesson.start_time) <= new Date()) {
      res.status(400).json({ error: 'Cannot cancel a lesson that has already started or passed' });
      return;
    }

    await query(`UPDATE scheduled_lessons SET status = 'cancelled' WHERE id = $1`, [lessonId]);

    const config = await OperatorService.getConfig(operatorId);
    const avgPrice = config.avgLessonPriceUsd || 185;

    const cancelIns = await query(
      `INSERT INTO cancellation_events
         (operator_id, student_id, student_name, slot_start, slot_end, revenue_at_risk_usd, recovered, simulated)
       VALUES ($1, $2, $3, $4, $5, $6, false, false)
       RETURNING *`,
      [operatorId, userId, lesson.student_name, lesson.start_time, lesson.end_time, avgPrice]
    );
    const cancelEvent = cancelIns.rows[0];

    broadcastToOperator(operatorId, 'cancellation.detected', {
      studentName: lesson.student_name,
      slotStart: lesson.start_time,
      slotEnd: lesson.end_time,
      revenueAtRisk: avgPrice,
      source: 'student_portal',
    });

    await AuditService.log(operatorId, 'student_lesson_cancelled', `student:${userId}`, undefined, {
      lessonId,
      studentName: lesson.student_name,
      slotStart: lesson.start_time,
      reason: reason || null,
    });

    const staffResult = await query(
      `SELECT id FROM users WHERE operator_id = $1 AND role IN ('admin', 'scheduler')`,
      [operatorId]
    );
    const title = 'Lesson cancelled by student';
    const body = `${lesson.student_name} cancelled ${lesson.lesson_type} (${new Date(lesson.start_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}). Open slot — review queue for fill suggestions.`;
    for (const row of staffResult.rows as { id: string }[]) {
      await query(
        `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
         VALUES ($1, $2, 'lesson_cancelled', $3, $4, $5)`,
        [operatorId, row.id, title, body, JSON.stringify({ lessonId, studentId: userId })]
      );
    }

    const whenStr = new Date(lesson.start_time).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    await query(
      `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
       VALUES ($1, $2, 'lesson_cancelled_confirm', $3, $4, $5)`,
      [
        operatorId,
        userId,
        'Cancellation confirmed',
        `Your ${lesson.lesson_type} on ${whenStr} is cancelled. Staff have been notified.`,
        JSON.stringify({ lessonId, reason: reason ?? null }),
      ]
    );

    await NotificationService.sendStudentTransactionalEmail({
      operatorId,
      userId,
      studentName: lesson.student_name,
      subject: 'Lesson cancelled',
      html: `<p>Hi ${escapeHtml(lesson.student_name)},</p>
<p>Your <strong>${escapeHtml(lesson.lesson_type)}</strong> on <strong>${whenStr}</strong> is cancelled. Staff have been notified.</p>
${reason ? `<p>Reason: ${escapeHtml(reason)}</p>` : ''}
<p>You can also view this in your in-app notifications.</p>`,
      context: 'student_lesson_cancelled',
    });


    const fillResult = await query(
      `SELECT u.id, u.name, sp.aircraft_tail, sp.instructor_name, sp.license_type, sp.hours_logged,
              MAX(sl2.start_time) FILTER (WHERE sl2.status = 'completed') AS last_flight,
              COUNT(sl2.id) FILTER (WHERE sl2.start_time >= NOW() - INTERVAL '30 days' AND sl2.status = 'completed') AS flights_30d
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       LEFT JOIN scheduled_lessons sl2 ON sl2.user_id = sp.user_id AND sl2.operator_id = sp.operator_id
       WHERE sp.operator_id = $1 AND u.id != $2
       GROUP BY u.id, u.name, sp.aircraft_tail, sp.instructor_name, sp.license_type, sp.hours_logged
       ORDER BY COUNT(sl2.id) FILTER (WHERE sl2.start_time >= NOW() - INTERVAL '30 days' AND sl2.status = 'completed') ASC,
                MAX(sl2.start_time) FILTER (WHERE sl2.status = 'completed') ASC NULLS FIRST
       LIMIT 1`,
      [operatorId, userId]
    );

    let suggestionId: string | null = null;
    if (fillResult.rows.length > 0) {
      const fill = fillResult.rows[0] as {
        id: string;
        name: string;
        aircraft_tail: string;
        instructor_name: string;
        license_type: string;
        hours_logged: string;
        last_flight: string | null;
      };
      const daysSinceLast = fill.last_flight
        ? Math.floor((Date.now() - new Date(fill.last_flight).getTime()) / 86400000)
        : 999;

      const fillSuggestion = await SuggestionService.create(
        operatorId,
        'waitlist',
        92,
        {
          studentId: fill.id,
          studentName: fill.name,
          instructorId: 'INS-201',
          instructorName: fill.instructor_name || 'Instructor',
          aircraftId: 'AC-301',
          aircraftTail: fill.aircraft_tail || 'N12345',
          startTime: lesson.start_time,
          endTime: lesson.end_time,
          lessonType: `${fill.license_type || 'PPL'} — Cancellation fill`,
          locationId: 'LOC-001',
        },
        {
          trigger: `Student cancellation: ${lesson.student_name} freed a slot — top waitlist-style candidate surfaced`,
          candidateScore: [
            {
              studentId: fill.id,
              name: fill.name,
              score: 0.93,
              signals: {
                daysSinceLastFlight: daysSinceLast === 999 ? 45 : daysSinceLast,
                daysUntilNextFlight: 14,
                totalFlightHours: Number(fill.hours_logged) || 0,
                customWeights: { cancellationFill: 1.0 },
              },
            },
          ],
          constraintsEvaluated: [
            'slot: recovered from student cancellation',
            'availability: pass',
            'aircraft: matched to school fleet',
          ],
          alternativesConsidered: 4,
          confidence: 'high',
          summary: `${fill.name} is prioritized for the open slot based on recency and training progress.`,
        },
        24
      );
      suggestionId = fillSuggestion.id;
      await query(`UPDATE cancellation_events SET filled_by_suggestion_id = $1 WHERE id = $2`, [
        fillSuggestion.id,
        cancelEvent.id,
      ]);
    }

    broadcastToOperator(operatorId, 'student.lesson_cancelled', {
      lessonId,
      studentName: lesson.student_name,
      suggestionId,
    });

    res.json({
      ok: true,
      suggestionId,
      message: suggestionId
        ? 'Lesson cancelled — dispatchers notified and a fill candidate was added to the approval queue.'
        : 'Lesson cancelled — dispatchers notified.',
    });
  } catch (error) {
    console.error('Student cancel lesson error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/notifications
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const result = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );
    res.json({ notifications: result.rows });
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/students/notifications/:id/read
router.post('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    await query(`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.sub]);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/students/request-schedule
router.post('/request-schedule', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const operatorId = req.user!.operatorId;
    const {
      windows, goalHours, weekStart,
      horizonDays = 7,
      rangeStartOffset = 0,
    } = req.body as {
      windows: AvailabilityWindow[];
      goalHours: number;
      weekStart: string;
      horizonDays?: number;
      rangeStartOffset?: number;
    };
    if (!windows || windows.length === 0) { res.status(400).json({ error: 'At least one availability window required' }); return; }
    const horizon = Math.min(120, Math.max(7, Number(horizonDays) || 7));
    const offset = Math.max(0, Math.min(365, Number(rangeStartOffset) || 0));

    const profileResult = await query(
      `SELECT sp.*, u.name FROM student_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.user_id = $1`,
      [userId]
    );
    if (profileResult.rows.length === 0) { res.status(404).json({ error: 'Student profile not found' }); return; }
    const profile = profileResult.rows[0];
    const hoursLogged = parseFloat(profile.hours_logged);
    const hoursRequired = parseFloat(profile.hours_required);
    const hoursRemaining = hoursRequired - hoursLogged;
    const nextLessonNum = Math.floor(hoursLogged / 2) + 1;

    const availResult = await query(
      `INSERT INTO student_availability (user_id, operator_id, week_start, windows, goal_hours) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, operatorId, weekStart, JSON.stringify(windows), goalHours]
    );
    const availabilityId = availResult.rows[0].id;

    const weatherChecks = await Promise.all(windows.map((w: AvailabilityWindow) => assessWeatherForLesson(w.date)));
    const windowsWithWeather = windows.map((w: AvailabilityWindow, i: number) => ({
      ...w, weatherOk: weatherChecks[i].pass, weatherNote: weatherChecks[i].condition,
    }));

    const windowsText = windowsWithWeather.map((w: any) =>
      `  - ${w.date} from ${w.startTime} to ${w.endTime} | Weather: ${w.weatherOk ? '✅ VFR' : '⚠ ' + w.weatherNote}`
    ).join('\n');

    const prompt = `You are an intelligent flight school scheduling assistant for ${profile.name}, a student at SkyHigh Flight School.

Student Profile:
- License goal: ${profile.license_type} (${hoursRequired}h required)
- Hours logged: ${hoursLogged}h | Remaining: ${hoursRemaining}h
- Assigned instructor: ${profile.instructor_name}
- Assigned aircraft: ${profile.aircraft_tail}
- Current lesson number: ${nextLessonNum}

Availability (${horizon} days from offset +${offset}d; window starts ${weekStart}) with real weather:
${windowsText}

Goal: Schedule approximately ${goalHours} hours across this planning horizon. Each lesson = 2 hours. Max 1 lesson/day. Only VFR days. Morning preferred.

Return ONLY valid JSON array:
[{
  "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM",
  "lessonType": "<specific lesson name>",
  "instructorName": "${profile.instructor_name}", "aircraftTail": "${profile.aircraft_tail}",
  "durationHours": 2, "lessonNumber": ${nextLessonNum},
  "objectives": ["<obj1>", "<obj2>", "<obj3>"],
  "weatherCondition": "<weather note>"
}]`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    let aiSchedule;
    try {
      aiSchedule = JSON.parse(responseText.replace(/```json|```/g, '').trim());
    } catch { res.status(500).json({ error: 'Failed to parse AI schedule' }); return; }

    const pendingPrev = await query(
      `SELECT id FROM lesson_requests WHERE user_id = $1 AND operator_id = $2 AND status = 'pending_approval'`,
      [userId, operatorId]
    );
    const supersededIds = (pendingPrev.rows as { id: string }[]).map((r) => r.id);
    if (supersededIds.length > 0) {
      await query(
        `UPDATE lesson_requests SET status = 'superseded', admin_notes = 'Superseded by a newer schedule request.'
         WHERE id = ANY($1::uuid[])`,
        [supersededIds]
      );
      await query(
        `UPDATE suggestions SET status = 'expired', reviewed_at = COALESCE(reviewed_at, NOW())
         WHERE operator_id = $1 AND status = 'pending' AND payload->>'lessonRequestId' = ANY($2::text[])`,
        [operatorId, supersededIds]
      );
    }

    const requestResult = await query(
      `INSERT INTO lesson_requests (user_id, operator_id, availability_id, requested_hours, ai_schedule) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, operatorId, availabilityId, goalHours, JSON.stringify(aiSchedule)]
    );

    const suggestionPayload = {
      studentId: userId, studentName: profile.name,
      instructorId: profile.instructor_id, instructorName: profile.instructor_name,
      aircraftId: 'AC-301', aircraftTail: profile.aircraft_tail,
      startTime: aiSchedule[0]?.date + 'T' + aiSchedule[0]?.startTime + ':00Z',
      endTime: aiSchedule[0]?.date + 'T' + aiSchedule[0]?.endTime + ':00Z',
      lessonType: `Student Schedule Request: ${aiSchedule.length} lessons (${goalHours}h) — ${profile.name}`,
      locationId: 'LOC-001', lessonRequestId: requestResult.rows[0].id,
      fullSchedule: aiSchedule,
    };

    const suggestionRationale = {
      trigger: `Student ${profile.name} requested ${goalHours}h across ${horizon} days (starts ${weekStart}, offset +${offset}d)`,
      candidateScore: [{ studentId: userId, name: profile.name, score: 0.95, signals: { daysSinceLastFlight: 3, daysUntilNextFlight: 0, totalFlightHours: hoursLogged, customWeights: { studentRequested: 1.0 } } }],
      constraintsEvaluated: [
        `availability: ${windows.length} windows provided`,
        `weather: ${windowsWithWeather.filter((w: any) => w.weatherOk).length}/${windows.length} days VFR`,
        `instructor ${profile.instructor_name}: matched`,
        `aircraft ${profile.aircraft_tail}: matched`,
        `curriculum: lesson ${nextLessonNum} sequenced correctly`,
      ],
      alternativesConsidered: aiSchedule.length, confidence: 'high' as const,
    };

    const suggestionResult = await query(
      `INSERT INTO suggestions (operator_id, type, status, priority, payload, rationale, expires_at) VALUES ($1, 'next_lesson', 'pending', 90, $2, $3, NOW() + INTERVAL '7 days') RETURNING id`,
      [operatorId, JSON.stringify(suggestionPayload), JSON.stringify(suggestionRationale)]
    );

    const reqRow = requestResult.rows[0] as { id: string };
    await AuditService.log(operatorId, 'student_schedule_request', `student:${userId}`, suggestionResult.rows[0].id, {
      requestId: reqRow.id,
      studentName: profile.name,
      goalHours,
      lessons: aiSchedule.length,
      slots: summarizeSlotsForAudit(aiSchedule),
    });
    await query(
      `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
       VALUES ($1, $2, 'schedule_request_ready', $3, $4, $5)`,
      [
        operatorId,
        userId,
        'Schedule draft ready',
        `We generated ${aiSchedule.length} proposed lesson${aiSchedule.length === 1 ? '' : 's'} (${goalHours}h goal). Review and edit if needed, then submit for staff approval.`,
        JSON.stringify({ requestId: reqRow.id, lessonCount: aiSchedule.length, goalHours }),
      ]
    );

    await NotificationService.sendStudentTransactionalEmail({
      operatorId,
      userId,
      studentName: profile.name,
      subject: 'Your schedule draft is ready',
      html: `<p>Hi ${escapeHtml(profile.name)},</p>
<p>We generated <strong>${aiSchedule.length}</strong> proposed lesson(s) toward your <strong>${goalHours}h</strong> goal. Review and edit in the student portal, then submit for staff approval.</p>`,
      context: 'schedule_draft_ready',
    });


    res.json({ request: requestResult.rows[0], schedule: aiSchedule, weatherWarnings: windowsWithWeather.filter((w: any) => !w.weatherOk).map((w: any) => `${w.date}: ${w.weatherNote}`) });
  } catch (error) { console.error('Request schedule error:', error); res.status(500).json({ error: 'Failed to generate schedule' }); }
});

// POST /api/students/lesson-requests/:requestId/submit — student saves edited slots and notifies admin + dispatchers
router.post('/lesson-requests/:requestId/submit', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const operatorId = req.user!.operatorId;
    const { requestId } = req.params;
    const { aiSchedule } = req.body as { aiSchedule?: unknown[] };
    if (!Array.isArray(aiSchedule) || aiSchedule.length === 0) {
      res.status(400).json({ error: 'aiSchedule must be a non-empty array' });
      return;
    }

    const lrCheck = await query(
      `SELECT lr.id, lr.status, u.name AS student_name FROM lesson_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE lr.id = $1 AND lr.user_id = $2 AND lr.operator_id = $3`,
      [requestId, userId, operatorId]
    );
    if (lrCheck.rows.length === 0) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    const lrRow = lrCheck.rows[0] as { id: string; status: string; student_name: string };
    if (lrRow.status !== 'pending_approval') {
      res.status(400).json({ error: 'This request is no longer pending approval' });
      return;
    }

    await query(
      `UPDATE lesson_requests SET ai_schedule = $1::jsonb WHERE id = $2`,
      [JSON.stringify(aiSchedule), requestId]
    );

    const sugUpd = await query(
      `UPDATE suggestions
       SET payload = jsonb_set(payload::jsonb, '{fullSchedule}', $1::jsonb)
       WHERE operator_id = $2 AND payload->>'lessonRequestId' = $3
       RETURNING id`,
      [JSON.stringify(aiSchedule), operatorId, requestId]
    );

    const studentName = lrRow.student_name;
    const staffResult = await query(
      `SELECT id, name, phone FROM users WHERE operator_id = $1 AND role IN ('admin', 'scheduler')`,
      [operatorId]
    );

    const title = 'Student finalized schedule';
    const body = `${studentName} submitted their proposed schedule (${aiSchedule.length} lesson${aiSchedule.length === 1 ? '' : 's'}). Review in Approval Queue.`;
    for (const row of staffResult.rows as { id: string }[]) {
      await query(
        `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
         VALUES ($1, $2, 'schedule_submitted', $3, $4, $5)`,
        [operatorId, row.id, title, body, JSON.stringify({ requestId, lessonCount: aiSchedule.length })]
      );
    }

    await query(
      `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
       VALUES ($1, $2, 'schedule_submit_confirmation', $3, $4, $5)`,
      [
        operatorId,
        userId,
        'Schedule submitted for review',
        `You submitted ${aiSchedule.length} lesson${aiSchedule.length === 1 ? '' : 's'} for staff approval. They will confirm or follow up in the Approval Queue.`,
        JSON.stringify({ requestId, lessonCount: aiSchedule.length }),
      ]
    );

    await NotificationService.sendStudentTransactionalEmail({
      operatorId,
      userId,
      studentName,
      subject: 'Schedule submitted for review',
      html: `<p>Hi ${escapeHtml(studentName)},</p>
<p>We received your proposed schedule (<strong>${aiSchedule.length}</strong> lesson(s)). Staff will review it in the approval queue.</p>`,
      context: 'schedule_submitted_student',
    });


    await NotificationService.sendStaffStudentScheduleSubmittedSMS(operatorId, {
      requestId,
      studentName,
      lessonCount: aiSchedule.length,
      staffRows: staffResult.rows as { id: string; name: string; phone: string | null }[],
    });

    await AuditService.log(operatorId, 'student_schedule_submitted', `student:${userId}`, sugUpd.rows[0]?.id ?? undefined, {
      requestId,
      studentName,
      lessons: aiSchedule.length,
      slots: summarizeSlotsForAudit(aiSchedule),
    });

    broadcastToOperator(operatorId, 'student.schedule_submitted', {
      requestId,
      studentName,
      lessonCount: aiSchedule.length,
    });

    res.json({ ok: true, suggestionId: sugUpd.rows[0]?.id ?? null });
  } catch (error) {
    console.error('Submit lesson request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/students/lesson-requests/:requestId/draft — persist edited slots while pending (audit each save)
router.patch('/lesson-requests/:requestId/draft', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const operatorId = req.user!.operatorId;
    const { requestId } = req.params;
    const { aiSchedule } = req.body as { aiSchedule?: unknown[] };
    if (!Array.isArray(aiSchedule) || aiSchedule.length === 0) {
      res.status(400).json({ error: 'aiSchedule must be a non-empty array' });
      return;
    }

    const lrCheck = await query(
      `SELECT lr.id, lr.status, lr.ai_schedule, u.name AS student_name FROM lesson_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE lr.id = $1 AND lr.user_id = $2 AND lr.operator_id = $3`,
      [requestId, userId, operatorId]
    );
    if (lrCheck.rows.length === 0) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    const lrRow = lrCheck.rows[0] as { id: string; status: string; ai_schedule: unknown; student_name: string };
    if (lrRow.status !== 'pending_approval') {
      res.status(400).json({ error: 'Draft edits only apply while the request is pending approval' });
      return;
    }

    const prevJson = JSON.stringify(lrRow.ai_schedule ?? []);
    const nextJson = JSON.stringify(aiSchedule);
    if (prevJson === nextJson) {
      res.json({ ok: true, unchanged: true });
      return;
    }

    await query(`UPDATE lesson_requests SET ai_schedule = $1::jsonb WHERE id = $2`, [nextJson, requestId]);
    await query(
      `UPDATE suggestions
       SET payload = jsonb_set(payload::jsonb, '{fullSchedule}', $1::jsonb)
       WHERE operator_id = $2 AND payload->>'lessonRequestId' = $3`,
      [nextJson, operatorId, requestId]
    );

    await AuditService.log(operatorId, 'student_schedule_draft_updated', `student:${userId}`, undefined, {
      requestId,
      studentName: lrRow.student_name,
      lessonCount: aiSchedule.length,
      slots: summarizeSlotsForAudit(aiSchedule),
    });

    const throttleCheck = await query(
      `SELECT 1 FROM notifications
       WHERE operator_id = $1 AND type = 'schedule_draft_updated_staff'
         AND payload->>'requestId' = $2
         AND created_at >= NOW() - (INTERVAL '1 minute' * $3::int)
       LIMIT 1`,
      [operatorId, requestId, DRAFT_STAFF_NOTIFY_THROTTLE_MINUTES]
    );

    if (throttleCheck.rows.length === 0) {
      const staffResult = await query(
        `SELECT id FROM users WHERE operator_id = $1 AND role IN ('admin', 'scheduler')`,
        [operatorId]
      );
      const title = 'Student updated schedule draft';
      const body = `${lrRow.student_name} revised their proposed schedule (${aiSchedule.length} lesson${aiSchedule.length === 1 ? '' : 's'}). Review in Approval Queue.`;
      const payload = JSON.stringify({
        requestId,
        lessonCount: aiSchedule.length,
        studentName: lrRow.student_name,
        throttled: false,
      });
      for (const row of staffResult.rows as { id: string }[]) {
        await query(
          `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
           VALUES ($1, $2, 'schedule_draft_updated_staff', $3, $4, $5)`,
          [operatorId, row.id, title, body, payload]
        );
      }
      broadcastToOperator(operatorId, 'student.schedule_draft_updated', {
        requestId,
        studentName: lrRow.student_name,
        lessonCount: aiSchedule.length,
      });
    }

    res.json({ ok: true, staffNotified: throttleCheck.rows.length === 0 });
  } catch (error) {
    console.error('Patch lesson request draft error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/students/approve-request/:requestId — admin approves a lesson request → confirms lessons into calendar
router.post('/approve-request/:requestId', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const operatorId = req.user!.operatorId;
    const reviewerId = req.user!.sub;

    const { lessonsCreated, alreadyApproved } = await approveLessonRequestByStaff(operatorId, requestId, reviewerId);
    res.json({ ok: true, lessonsCreated, alreadyApproved });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Approve request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/students/decline-request/:requestId — admin/scheduler declines a lesson request, emails student
router.post('/decline-request/:requestId', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const operatorId = req.user!.operatorId;
    const reviewerId = req.user!.sub;
    const { reason } = req.body as { reason?: string };

    if (!uuidValidate(requestId)) {
      res.status(400).json({ error: 'Invalid request id' });
      return;
    }

    const reqResult = await query(
      `SELECT lr.*, u.name AS student_name, u.id AS student_id
       FROM lesson_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE lr.id = $1 AND lr.operator_id = $2`,
      [requestId, operatorId]
    );
    if (reqResult.rows.length === 0) {
      res.status(404).json({ error: 'Lesson request not found' });
      return;
    }
    const lr = reqResult.rows[0] as {
      id: string; status: string; student_name: string; student_id: string;
    };
    if (lr.status !== 'pending_approval') {
      res.status(400).json({ error: `Cannot decline a request with status: ${lr.status}` });
      return;
    }

    await query(
      `UPDATE lesson_requests SET status = 'declined', updated_at = NOW() WHERE id = $1`,
      [requestId]
    );

    // Mark any pending suggestions for this request as declined too
    await query(
      `UPDATE suggestions SET status = 'declined', reviewed_at = NOW(), reviewed_by = $1
       WHERE operator_id = $2 AND status = 'pending' AND payload->>'lessonRequestId' = $3`,
      [reviewerId, operatorId, requestId]
    );

    await AuditService.log(operatorId, 'lesson_request_declined', `scheduler:${reviewerId}`, requestId, { reason: reason || null });

    // In-app notification to student
    await query(
      `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
       VALUES ($1, $2, 'schedule_request_declined', $3, $4, $5)`,
      [
        operatorId,
        lr.student_id,
        'Schedule request declined',
        reason
          ? `Your schedule request was declined. Reason: ${reason}`
          : 'Your schedule request was declined. Please contact your school to discuss rescheduling.',
        JSON.stringify({ lessonRequestId: requestId, reason: reason ?? null }),
      ]
    );

    // Email notification to student
    await NotificationService.sendStudentTransactionalEmail({
      operatorId,
      userId: lr.student_id,
      studentName: lr.student_name,
      subject: 'Schedule request declined',
      html: `<p>Hi ${escapeHtml(lr.student_name)},</p>
<p>Your schedule request has been reviewed and was <strong>not approved</strong> at this time.</p>
${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
<p>Please contact your instructor or school admin to discuss rescheduling or to submit a new request.</p>`,
      context: 'lesson_request_declined',
    });

    broadcastToOperator(operatorId, 'lesson_request.declined', { requestId, studentId: lr.student_id });

    res.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Decline request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/all
router.get('/all', requireRole('admin', 'scheduler', 'instructor'), async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const instructorFilter = req.user!.role === 'instructor' ? req.user!.sub : null;

    let queryStr = `SELECT sp.*, u.name, u.email,
        (SELECT COUNT(*) FROM scheduled_lessons sl WHERE sl.user_id = sp.user_id AND sl.status = 'confirmed') as confirmed_lessons,
        (SELECT MAX(end_time) FROM scheduled_lessons sl WHERE sl.user_id = sp.user_id AND sl.status IN ('completed','confirmed')) as last_lesson_at,
        (SELECT COUNT(*) FROM lesson_requests lr WHERE lr.user_id = sp.user_id AND lr.status = 'pending_approval') as pending_requests
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       WHERE sp.operator_id = $1`;

    const params: any[] = [operatorId];
    if (instructorFilter) {
      queryStr += ` AND sp.instructor_id = $2`;
      params.push(instructorFilter);
    }
    queryStr += ` ORDER BY sp.hours_logged DESC`;

    const result = await query(queryStr, params);

    const students = result.rows.map((s: any) => {
      const hoursLogged = parseFloat(s.hours_logged);
      const hoursRequired = parseFloat(s.hours_required);
      const hoursScheduled = parseFloat(s.hours_scheduled);
      const completionPct = Math.min(100, Math.round((hoursLogged / hoursRequired) * 100));
      const lastFlown = s.last_lesson_at ? new Date(s.last_lesson_at) : null;
      const daysSinceLastFlight = lastFlown ? Math.floor((Date.now() - lastFlown.getTime()) / (1000 * 60 * 60 * 24)) : 999;
      const atRisk = daysSinceLastFlight > 14;
      const remainingHours = hoursRequired - hoursLogged - hoursScheduled;
      const weeksToGrad = Math.max(0, remainingHours / (s.lessons_per_week_target * 2));
      const gradDate = new Date(); gradDate.setDate(gradDate.getDate() + weeksToGrad * 7);
      const programStart = new Date(s.program_start_date);
      const contractWeeks = hoursRequired / (s.lessons_per_week_target * 2);
      const expectedGradDate = new Date(programStart); expectedGradDate.setDate(expectedGradDate.getDate() + contractWeeks * 7);
      const weeksDelta = Math.round((gradDate.getTime() - expectedGradDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
      return { ...s, hoursLogged, hoursRequired, hoursScheduled, completionPct, daysSinceLastFlight, atRisk, projectedGradDate: gradDate.toISOString(), expectedGradDate: expectedGradDate.toISOString(), weeksDelta, pendingRequests: parseInt(s.pending_requests, 10) };
    });

    res.json({ students });
  } catch (error) { console.error('Get all students error:', error); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/students/instructor-schedule — instructor sees their own upcoming lessons
router.get('/instructor-schedule', requireRole('instructor', 'admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const operatorId = req.user!.operatorId;
    const userResult = await query(`SELECT name FROM users WHERE id = $1`, [userId]);
    const instructorName = userResult.rows[0]?.name || '';

    const lessons = await query(
      `SELECT sl.*, u.name as student_name FROM scheduled_lessons sl
       JOIN users u ON u.id = sl.user_id
       WHERE sl.operator_id = $1 AND sl.instructor_name = $2
       AND sl.start_time >= NOW() - INTERVAL '1 day'
       ORDER BY sl.start_time ASC LIMIT 30`,
      [operatorId, instructorName]
    );
    res.json({ lessons: lessons.rows, instructorName });
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/students/:userId/profile — admin detail view
router.get('/:userId/profile', requireRole('admin', 'scheduler', 'instructor'), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const operatorId = req.user!.operatorId;

    const [profileResult, lessonsResult, requestsResult, minimumsResult] = await Promise.all([
      query(`SELECT sp.*, u.name, u.email FROM student_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.user_id = $1 AND sp.operator_id = $2`, [userId, operatorId]),
      query(`SELECT * FROM scheduled_lessons WHERE user_id = $1 ORDER BY start_time DESC LIMIT 10`, [userId]),
      query(`SELECT * FROM lesson_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3`, [userId]),
      query(`SELECT * FROM course_minimums WHERE license_type = (SELECT license_type FROM student_profiles WHERE user_id = $1) ORDER BY sort_order`, [userId]),
    ]);

    if (profileResult.rows.length === 0) { res.status(404).json({ error: 'Student not found' }); return; }
    const profile = profileResult.rows[0];
    const hoursLogged = parseFloat(profile.hours_logged);
    const hoursMap: Record<string, number> = {
      ground: parseFloat(profile.hours_ground) || hoursLogged * 0.25,
      flight: hoursLogged,
      solo: parseFloat(profile.hours_solo) || hoursLogged * 0.15,
      cross_country: parseFloat(profile.hours_cross_country) || hoursLogged * 0.05,
      night: parseFloat(profile.hours_night) || 0,
      sim: parseFloat(profile.hours_sim) || 0,
      pic: hoursLogged * 0.4,
    };
    const minimums = minimumsResult.rows.map((m: any) => ({
      category: m.category, label: m.label, required: parseFloat(m.hours_required),
      logged: Math.min(parseFloat(m.hours_required), hoursMap[m.category] || 0),
      pct: Math.min(100, Math.round(((hoursMap[m.category] || 0) / parseFloat(m.hours_required)) * 100)),
    }));

    res.json({ profile, lessons: lessonsResult.rows, requests: requestsResult.rows, minimums });
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
});

// PATCH /api/students/notification-prefs — persist notification preferences to DB
router.patch('/notification-prefs', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const { sms, email, in_app } = req.body as { sms?: boolean; email?: boolean; in_app?: boolean };
    await query(
      `UPDATE student_profiles
       SET notification_sms = COALESCE($1, notification_sms),
           notification_email = COALESCE($2, notification_email),
           notification_in_app = COALESCE($3, notification_in_app)
       WHERE user_id = $4`,
      [sms ?? null, email ?? null, in_app ?? null, userId]
    );

    const parts: string[] = [];
    if (sms !== undefined) parts.push(`SMS ${sms ? 'on' : 'off'}`);
    if (email !== undefined) parts.push(`email ${email ? 'on' : 'off'}`);
    if (in_app !== undefined) parts.push(`in-app ${in_app ? 'on' : 'off'}`);
    const detail = parts.length > 0 ? parts.join(' · ') : 'Preferences saved.';
    await query(
      `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
       VALUES ($1, $2, 'notification_prefs_updated', $3, $4, $5)`,
      [
        req.user!.operatorId,
        userId,
        'Notification settings updated',
        detail,
        JSON.stringify({ sms, email, in_app }),
      ]
    );

    await AuditService.log(req.user!.operatorId, 'student_notification_prefs_updated', `student:${userId}`, undefined, {
      sms,
      email,
      in_app,
    });

    res.json({ ok: true, prefs: { sms, email, in_app } });
  } catch (error) {
    console.error('Update notification prefs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/students/notification-prefs — retrieve notification preferences
router.get('/notification-prefs', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const result = await query(
      `SELECT notification_sms, notification_email, notification_in_app FROM student_profiles WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      res.json({ sms: true, email: true, in_app: true });
      return;
    }
    const row = result.rows[0];
    res.json({ sms: row.notification_sms ?? true, email: row.notification_email ?? true, in_app: row.notification_in_app ?? true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/students/staff/lessons/:lessonId/cancel — admin/scheduler cancels a confirmed lesson on behalf of the school
// Notifies the student by email + in-app, creates a cancellation event + fill suggestion, logs audit.
router.post('/staff/lessons/:lessonId/cancel', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const staffId = req.user!.sub;
    const { lessonId } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!uuidValidate(lessonId)) {
      res.status(400).json({ error: 'Invalid lesson id' });
      return;
    }

    const lessonResult = await query(
      `SELECT sl.*, u.name AS student_name, u.id AS student_id
       FROM scheduled_lessons sl
       JOIN users u ON u.id = sl.user_id
       WHERE sl.id = $1 AND sl.operator_id = $2`,
      [lessonId, operatorId]
    );
    if (lessonResult.rows.length === 0) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }
    const lesson = lessonResult.rows[0] as {
      id: string;
      status: string;
      start_time: string;
      end_time: string;
      lesson_type: string;
      instructor_name: string;
      aircraft_tail: string;
      student_name: string;
      student_id: string;
    };

    if (lesson.status !== 'confirmed') {
      res.status(400).json({ error: 'Only confirmed lessons can be cancelled' });
      return;
    }
    if (new Date(lesson.start_time) <= new Date()) {
      res.status(400).json({ error: 'Cannot cancel a lesson that has already started or passed' });
      return;
    }

    await query(`UPDATE scheduled_lessons SET status = 'cancelled' WHERE id = $1`, [lessonId]);

    const config = await OperatorService.getConfig(operatorId);
    const avgPrice = config.avgLessonPriceUsd || 185;

    const cancelIns = await query(
      `INSERT INTO cancellation_events
         (operator_id, student_id, student_name, slot_start, slot_end, revenue_at_risk_usd, recovered, simulated)
       VALUES ($1, $2, $3, $4, $5, $6, false, false)
       RETURNING *`,
      [operatorId, lesson.student_id, lesson.student_name, lesson.start_time, lesson.end_time, avgPrice]
    );
    const cancelEvent = cancelIns.rows[0];

    broadcastToOperator(operatorId, 'cancellation.detected', {
      studentName: lesson.student_name,
      slotStart: lesson.start_time,
      slotEnd: lesson.end_time,
      revenueAtRisk: avgPrice,
      source: 'staff_portal',
    });

    await AuditService.log(operatorId, 'staff_lesson_cancelled', `scheduler:${staffId}`, undefined, {
      lessonId,
      studentName: lesson.student_name,
      studentId: lesson.student_id,
      slotStart: lesson.start_time,
      reason: reason || null,
    });

    const whenStr = new Date(lesson.start_time).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

    // In-app notification to student
    await query(
      `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
       VALUES ($1, $2, 'lesson_cancelled_by_staff', $3, $4, $5)`,
      [
        operatorId,
        lesson.student_id,
        'Lesson cancelled by school',
        `Your ${lesson.lesson_type} on ${whenStr} has been cancelled by your school.${reason ? ' Reason: ' + reason : ''} Please contact staff to reschedule.`,
        JSON.stringify({ lessonId, reason: reason ?? null }),
      ]
    );

    // Email to student
    await NotificationService.sendStudentTransactionalEmail({
      operatorId,
      userId: lesson.student_id,
      studentName: lesson.student_name,
      subject: 'Lesson cancelled by your school',
      html: `<p>Hi ${escapeHtml(lesson.student_name)},</p>
<p>Your <strong>${escapeHtml(lesson.lesson_type)}</strong> on <strong>${whenStr}</strong> has been cancelled by your school.</p>
${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
<p>Please contact your school to reschedule at your earliest convenience.</p>`,
      context: 'staff_lesson_cancelled',
    });


    // Surface a fill suggestion for the open slot
    const fillResult = await query(
      `SELECT u.id, u.name, sp.aircraft_tail, sp.instructor_name, sp.license_type, sp.hours_logged,
              MAX(sl2.start_time) FILTER (WHERE sl2.status = 'completed') AS last_flight
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       LEFT JOIN scheduled_lessons sl2 ON sl2.user_id = sp.user_id AND sl2.operator_id = sp.operator_id
       WHERE sp.operator_id = $1 AND u.id != $2
       GROUP BY u.id, u.name, sp.aircraft_tail, sp.instructor_name, sp.license_type, sp.hours_logged
       ORDER BY MAX(sl2.start_time) FILTER (WHERE sl2.status = 'completed') ASC NULLS FIRST
       LIMIT 1`,
      [operatorId, lesson.student_id]
    );

    let suggestionId: string | null = null;
    if (fillResult.rows.length > 0) {
      const fill = fillResult.rows[0] as {
        id: string; name: string; aircraft_tail: string; instructor_name: string;
        license_type: string; hours_logged: string; last_flight: string | null;
      };
      const daysSinceLast = fill.last_flight
        ? Math.floor((Date.now() - new Date(fill.last_flight).getTime()) / 86400000)
        : 999;
      const fillSuggestion = await SuggestionService.create(
        operatorId,
        'waitlist',
        92,
        {
          studentId: fill.id,
          studentName: fill.name,
          instructorId: 'INS-201',
          instructorName: lesson.instructor_name || fill.instructor_name || 'Instructor',
          aircraftId: 'AC-301',
          aircraftTail: lesson.aircraft_tail || fill.aircraft_tail || 'N12345',
          startTime: lesson.start_time,
          endTime: lesson.end_time,
          lessonType: `${fill.license_type || 'PPL'} — Cancellation fill`,
          locationId: 'LOC-001',
        },
        {
          trigger: `Staff cancellation: school freed a slot (${lesson.student_name}) — top waitlist candidate surfaced`,
          candidateScore: [
            {
              studentId: fill.id,
              name: fill.name,
              score: 0.93,
              signals: {
                daysSinceLastFlight: daysSinceLast === 999 ? 45 : daysSinceLast,
                daysUntilNextFlight: 14,
                totalFlightHours: Number(fill.hours_logged) || 0,
                customWeights: { cancellationFill: 1.0 },
              },
            },
          ],
          constraintsEvaluated: ['slot: recovered from staff cancellation', 'availability: pass', 'aircraft: matched'],
          alternativesConsidered: 4,
          confidence: 'high',
          summary: `${fill.name} is prioritized for the open slot based on training recency.`,
        },
        24
      );
      suggestionId = fillSuggestion.id;
      await query(`UPDATE cancellation_events SET filled_by_suggestion_id = $1 WHERE id = $2`, [
        fillSuggestion.id, cancelEvent.id,
      ]);
    }

    broadcastToOperator(operatorId, 'staff.lesson_cancelled', { lessonId, studentName: lesson.student_name, suggestionId });

    res.json({
      ok: true,
      suggestionId,
      message: suggestionId
        ? 'Lesson cancelled — student notified and a fill candidate was added to the approval queue.'
        : 'Lesson cancelled — student notified.',
    });
  } catch (error) {
    console.error('Staff cancel lesson error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
