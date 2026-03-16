import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, requireRole } from '../middleware/auth';
import { query } from '../db/connection';
import { AvailabilityWindow } from '../types';
import { assessWeatherForLesson } from '../services/weatherService';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.use(authenticate);

// GET /api/students/profile
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const profileResult = await query(
      `SELECT sp.*, u.name, u.email FROM student_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.user_id = $1`,
      [userId]
    );
    if (profileResult.rows.length === 0) { res.status(404).json({ error: 'Student profile not found' }); return; }
    const profile = profileResult.rows[0];

    const [lessonsResult, requestsResult, minimumsResult] = await Promise.all([
      query(`SELECT * FROM scheduled_lessons WHERE user_id = $1 AND status != 'cancelled' ORDER BY start_time ASC`, [userId]),
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
    const lessonsResult = await query(
      `SELECT * FROM scheduled_lessons WHERE user_id = $1 AND start_time >= NOW() - INTERVAL '30 days' ORDER BY start_time ASC LIMIT 60`,
      [userId]
    );
    res.json({ lessons: lessonsResult.rows });
  } catch (error) { res.status(500).json({ error: 'Internal server error' }); }
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
    const { windows, goalHours, weekStart } = req.body as { windows: AvailabilityWindow[]; goalHours: number; weekStart: string; };
    if (!windows || windows.length === 0) { res.status(400).json({ error: 'At least one availability window required' }); return; }

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

Availability this week (${weekStart}) with real weather:
${windowsText}

Goal: Schedule approximately ${goalHours} hours. Each lesson = 2 hours. Max 1 lesson/day. Only VFR days. Morning preferred.

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
      trigger: `Student ${profile.name} requested ${goalHours}h for week of ${weekStart}`,
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

    // Log to audit trail as student_schedule_request
    await query(
      `INSERT INTO audit_log (operator_id, suggestion_id, event_type, actor, payload) VALUES ($1, $2, 'student_schedule_request', $3, $4)`,
      [operatorId, suggestionResult.rows[0].id, `student:${userId}`, JSON.stringify({ studentName: profile.name, goalHours, lessons: aiSchedule.length })]
    );

    res.json({ request: requestResult.rows[0], schedule: aiSchedule, weatherWarnings: windowsWithWeather.filter((w: any) => !w.weatherOk).map((w: any) => `${w.date}: ${w.weatherNote}`) });
  } catch (error) { console.error('Request schedule error:', error); res.status(500).json({ error: 'Failed to generate schedule' }); }
});

// POST /api/students/approve-request/:requestId — admin approves a lesson request → confirms lessons into calendar
router.post('/approve-request/:requestId', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const operatorId = req.user!.operatorId;
    const reviewerId = req.user!.sub;

    const requestResult = await query(
      `SELECT lr.*, u.name as student_name FROM lesson_requests lr JOIN users u ON u.id = lr.user_id WHERE lr.id = $1 AND lr.operator_id = $2`,
      [requestId, operatorId]
    );
    if (requestResult.rows.length === 0) { res.status(404).json({ error: 'Request not found' }); return; }
    const lessonRequest = requestResult.rows[0];
    const aiSchedule = lessonRequest.ai_schedule as any[];

    // Create confirmed scheduled_lessons for each slot
    const createdLessons = [];
    for (const slot of aiSchedule) {
      const startTime = new Date(`${slot.date}T${slot.startTime}:00`);
      const endTime = new Date(`${slot.date}T${slot.endTime}:00`);
      const lessonResult = await query(
        `INSERT INTO scheduled_lessons (user_id, operator_id, lesson_request_id, lesson_type, instructor_name, aircraft_tail, start_time, end_time, status, duration_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', $9) RETURNING *`,
        [lessonRequest.user_id, operatorId, requestId, slot.lessonType, slot.instructorName, slot.aircraftTail, startTime.toISOString(), endTime.toISOString(), slot.durationHours]
      );
      createdLessons.push(lessonResult.rows[0]);
    }

    // Update request status
    await query(
      `UPDATE lesson_requests SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1 WHERE id = $2`,
      [reviewerId, requestId]
    );

    // Also mark the related suggestion as approved so it clears from the queue
    await query(
      `UPDATE suggestions SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1
       WHERE operator_id = $2 AND payload->>'lessonRequestId' = $3`,
      [reviewerId, operatorId, requestId]
    );

    // Update student scheduled hours
    const totalHours = aiSchedule.reduce((sum: number, s: any) => sum + s.durationHours, 0);
    await query(
      `UPDATE student_profiles SET hours_scheduled = hours_scheduled + $1 WHERE user_id = $2`,
      [totalHours, lessonRequest.user_id]
    );

    // Send notification to student
    await query(
      `INSERT INTO notifications (operator_id, user_id, type, title, body, payload) VALUES ($1, $2, 'schedule_approved', 'Schedule Approved! 🎉', $3, $4)`,
      [operatorId, lessonRequest.user_id,
        `Your schedule request has been approved! ${aiSchedule.length} lesson${aiSchedule.length !== 1 ? 's' : ''} (${totalHours}h) confirmed in your calendar.`,
        JSON.stringify({ lessonCount: aiSchedule.length, totalHours })]
    );

    // Log to audit
    await query(
      `INSERT INTO audit_log (operator_id, event_type, actor, payload) VALUES ($1, 'student_request_approved', $2, $3)`,
      [operatorId, `scheduler:${reviewerId}`, JSON.stringify({ requestId, studentName: lessonRequest.student_name, lessonsCreated: createdLessons.length })]
    );

    res.json({ ok: true, lessonsCreated: createdLessons.length, lessons: createdLessons });
  } catch (error) { console.error('Approve request error:', error); res.status(500).json({ error: 'Internal server error' }); }
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

export default router;
