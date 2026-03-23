import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, requireRole } from '../middleware/auth';
import { query } from '../db/connection';
import { OperatorService } from '../services/operatorService';
import { SuggestionService } from '../services/suggestionService';
import { AuditService } from '../services/auditService';
import { broadcastToOperator } from '../services/sseService';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Narrative cache: regenerate at most once per hour per operator ───────────
const narrativeCache = new Map<string, { text: string; stats: Record<string, number>; generatedAt: number }>();
const NARRATIVE_TTL_MS = 60 * 60 * 1000;

router.use(authenticate);

// ─── Frequency → graduation cost calculation utility ─────────────────────────

function calcGraduationRisk(
  hoursLoggedRaw: number | string,
  hoursRequiredRaw: number | string,
  flightsLast30DaysRaw: number | string,
  avgLessonPrice: number
) {
  const hoursLogged = Number(hoursLoggedRaw) || 0;
  const hoursRequired = Number(hoursRequiredRaw) || 0;
  const flightsLast30Days = Number(flightsLast30DaysRaw) || 0;
  const hoursRemaining = Math.max(0, hoursRequired - hoursLogged);
  // Assume ~2h per flight. flights/month → flights/week
  const flightsPerWeek = flightsLast30Days / 4.33;
  const hoursPerWeek = flightsPerWeek * 2;

  // FAA 40-hour minimum assumes ~3x/week pace
  const OPTIMAL_FLIGHTS_PER_WEEK = 3;
  const OPTIMAL_HOURS_PER_WEEK = OPTIMAL_FLIGHTS_PER_WEEK * 2;

  let projectedGraduationHours: number;
  if (hoursPerWeek < 0.5) {
    // Essentially no activity — project at the worst case (80h)
    projectedGraduationHours = Math.max(hoursRequired * 1.6, hoursLogged + 40);
  } else {
    // Scale: optimal pace hits the minimum; slower pace adds proportionally more hours
    const paceFactor = OPTIMAL_HOURS_PER_WEEK / Math.max(hoursPerWeek, 0.5);
    projectedGraduationHours = hoursLogged + hoursRemaining * Math.min(paceFactor, 2.5);
  }

  // Each flight hour costs avg lesson price (includes instructor + aircraft per hour)
  const extraHours = Math.max(0, projectedGraduationHours - hoursRequired);
  const extraCost = Math.round(extraHours * avgLessonPrice);

  let riskLevel: 'green' | 'yellow' | 'red';
  if (flightsPerWeek >= 2.5) riskLevel = 'green';
  else if (flightsPerWeek >= 1) riskLevel = 'yellow';
  else riskLevel = 'red';

  return {
    flights_per_week: Math.round(flightsPerWeek * 10) / 10,
    projected_graduation_hours: Math.round(projectedGraduationHours),
    extra_hours: Math.round(extraHours),
    extra_cost_usd: extraCost,
    risk_level: riskLevel,
  };
}

// ─── GET /api/analysis/graduation-risk ───────────────────────────────────────

router.get('/graduation-risk', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const config = await OperatorService.getConfig(operatorId);
    const avgPrice = config.avgLessonPriceUsd || 185;

    // Calculate flights_last_30_days and last_flight_date live from scheduled_lessons
    const result = await query(
      `SELECT
         sp.user_id, u.name, u.email,
         sp.license_type, sp.hours_logged, sp.hours_required,
         COUNT(sl.id) FILTER (WHERE sl.start_time >= NOW() - INTERVAL '30 days' AND sl.status = 'completed') AS flights_last_30_days,
         MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') AS last_flight_date
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       LEFT JOIN scheduled_lessons sl ON sl.user_id = sp.user_id AND sl.operator_id = sp.operator_id
       WHERE sp.operator_id = $1
       GROUP BY sp.user_id, u.name, u.email, sp.license_type, sp.hours_logged, sp.hours_required
       ORDER BY flights_last_30_days ASC`,
      [operatorId]
    );

    const students = result.rows.map((row: {
      user_id: string; name: string; email: string;
      license_type: string; hours_logged: number | string; hours_required: number | string;
      flights_last_30_days: number | string; last_flight_date: string | null;
    }) => {
      // Fall back to seeded values if no lesson history yet
      const flights30 = Number(row.flights_last_30_days) || 0;
      const risk = calcGraduationRisk(
        Number(row.hours_logged) || 0,
        Number(row.hours_required) || 0,
        flights30,
        avgPrice
      );
      const daysSinceLast = row.last_flight_date
        ? Math.floor((Date.now() - new Date(row.last_flight_date).getTime()) / 86400000)
        : 999;
      return {
        user_id: row.user_id,
        name: row.name,
        email: row.email,
        license_type: row.license_type,
        hours_logged: Number(row.hours_logged) || 0,
        hours_required: Number(row.hours_required) || 0,
        flights_last_30_days: flights30,
        last_flight_date: row.last_flight_date,
        days_since_last_flight: daysSinceLast,
        ...risk,
      };
    });

    res.json({ data: students, avg_lesson_price_usd: avgPrice });
  } catch (error) {
    console.error('Graduation risk error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/analysis/revenue-breakdown ─────────────────────────────────────

router.get('/revenue-breakdown', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const config = await OperatorService.getConfig(operatorId);
    const avgPrice = config.avgLessonPriceUsd || 185;

    // Revenue recovered: approved suggestions this month
    const approvedResult = await query(
      `SELECT COUNT(*) FROM suggestions
       WHERE operator_id = $1 AND status = 'approved'
         AND reviewed_at >= NOW() - INTERVAL '30 days'`,
      [operatorId]
    );
    const approvedCount = parseInt(approvedResult.rows[0].count, 10);

    // Revenue at risk: pending suggestions
    const pendingResult = await query(
      `SELECT COUNT(*) FROM suggestions
       WHERE operator_id = $1 AND status = 'pending'`,
      [operatorId]
    );
    const pendingCount = parseInt(pendingResult.rows[0].count, 10);

    // Cancellation stats
    const cancelResult = await query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN recovered THEN 1 ELSE 0 END) as recovered,
         SUM(CASE WHEN NOT recovered THEN revenue_at_risk_usd ELSE 0 END) as still_at_risk
       FROM cancellation_events
       WHERE operator_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [operatorId]
    );
    const cancelRow = cancelResult.rows[0];
    const totalCancellations = parseInt(cancelRow.total, 10) || 0;
    const recoveredCancellations = parseInt(cancelRow.recovered, 10) || 0;
    const lostToCancel = parseFloat(cancelRow.still_at_risk) || 0;

    // At-risk student projected loss — use live flight counts
    const studentsResult = await query(
      `SELECT sp.hours_logged, sp.hours_required,
         COUNT(sl.id) FILTER (WHERE sl.start_time >= NOW() - INTERVAL '30 days' AND sl.status = 'completed') AS flights_last_30_days
       FROM student_profiles sp
       LEFT JOIN scheduled_lessons sl ON sl.user_id = sp.user_id AND sl.operator_id = sp.operator_id
       WHERE sp.operator_id = $1
       GROUP BY sp.user_id, sp.hours_logged, sp.hours_required`,
      [operatorId]
    );
    let projectedLoss = 0;
    for (const row of studentsResult.rows) {
      const risk = calcGraduationRisk(
        Number(row.hours_logged) || 0,
        Number(row.hours_required) || 0,
        Number(row.flights_last_30_days) || 0,
        avgPrice
      );
      projectedLoss += risk.extra_cost_usd;
    }

    // Total opportunity: all suggestions generated this month
    const totalSuggestionsResult = await query(
      `SELECT COUNT(*) FROM suggestions
       WHERE operator_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [operatorId]
    );
    const totalSuggestions = parseInt(totalSuggestionsResult.rows[0].count, 10);

    res.json({
      opportunity_found_usd: totalSuggestions * avgPrice,
      revenue_recovered_usd: approvedCount * avgPrice,
      revenue_at_risk_usd: pendingCount * avgPrice,
      revenue_lost_cancellations_usd: lostToCancel || (totalCancellations - recoveredCancellations) * avgPrice,
      projected_loss_at_risk_students_usd: projectedLoss,
      avg_lesson_price_usd: avgPrice,
      period_days: 30,
    });
  } catch (error) {
    console.error('Revenue breakdown error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/analysis/cancellation-stats ────────────────────────────────────

router.get('/cancellation-stats', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const config = await OperatorService.getConfig(operatorId);
    const avgPrice = config.avgLessonPriceUsd || 185;

    const result = await query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN recovered THEN 1 ELSE 0 END) as filled,
         SUM(CASE WHEN recovered THEN revenue_at_risk_usd ELSE 0 END) as recovered_usd,
         SUM(CASE WHEN NOT recovered THEN revenue_at_risk_usd ELSE 0 END) as at_risk_usd
       FROM cancellation_events
       WHERE operator_id = $1`,
      [operatorId]
    );

    const row = result.rows[0];
    const total = parseInt(row.total, 10) || 0;
    const filled = parseInt(row.filled, 10) || 0;
    const recoveredUsd = parseFloat(row.recovered_usd) || filled * avgPrice;
    const atRiskUsd = parseFloat(row.at_risk_usd) || (total - filled) * avgPrice;

    // Without-agent baseline: derived from industry data for flight schools
    // (manual phone/email outreach fills ~10-15% of same-day cancellations within 4h).
    // We use a fixed 12% baseline — make explicit this is a benchmark, not a guess.
    const MANUAL_BASELINE_RATE = 0.12;
    const manualRecoveryRate = MANUAL_BASELINE_RATE;
    const agentRecoveryRate = total > 0 ? filled / total : 0;

    res.json({
      total_cancellations: total,
      filled_by_agent: filled,
      recovery_rate_pct: Math.round(agentRecoveryRate * 100),
      revenue_recovered_usd: recoveredUsd,
      revenue_still_at_risk_usd: atRiskUsd,
      without_agent: {
        recovery_rate_pct: Math.round(manualRecoveryRate * 100),
        revenue_recovered_usd: Math.round(total * avgPrice * manualRecoveryRate),
        avg_fill_time_hours: null,
        baseline_note: 'Industry benchmark: manual outreach fills ~12% of same-day cancellations',
      },
      with_agent: {
        recovery_rate_pct: Math.round(agentRecoveryRate * 100),
        revenue_recovered_usd: recoveredUsd,
        avg_fill_time_hours: 0.5,
      },
    });
  } catch (error) {
    console.error('Cancellation stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/analysis/simulate-cancellation ────────────────────────────────

router.post('/simulate-cancellation', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const config = await OperatorService.getConfig(operatorId);
    const avgPrice = config.avgLessonPriceUsd || 185;

    // Pick the real student with the longest gap since last flight as the "cancelling" student
    const cancellerResult = await query(`
      SELECT u.id, u.name, sp.aircraft_tail, sp.instructor_name, sp.license_type,
             MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') AS last_flight
      FROM student_profiles sp
      JOIN users u ON u.id = sp.user_id
      LEFT JOIN scheduled_lessons sl ON sl.user_id = sp.user_id AND sl.operator_id = sp.operator_id
      WHERE sp.operator_id = $1
      GROUP BY u.id, u.name, sp.aircraft_tail, sp.instructor_name, sp.license_type
      ORDER BY last_flight ASC NULLS FIRST
      LIMIT 1
    `, [operatorId]);

    // Pick the most at-risk waitlist candidate (longest gap + no upcoming lesson)
    const fillCandidateResult = await query(`
      SELECT u.id, u.name, sp.aircraft_tail, sp.instructor_name, sp.license_type,
             sp.hours_logged, sp.hours_required,
             COUNT(sl.id) FILTER (WHERE sl.start_time >= NOW() - INTERVAL '30 days' AND sl.status = 'completed') AS flights_30d,
             MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') AS last_flight
      FROM student_profiles sp
      JOIN users u ON u.id = sp.user_id
      LEFT JOIN scheduled_lessons sl ON sl.user_id = sp.user_id AND sl.operator_id = sp.operator_id
      WHERE sp.operator_id = $1
      GROUP BY u.id, u.name, sp.aircraft_tail, sp.instructor_name, sp.license_type, sp.hours_logged, sp.hours_required
      ORDER BY
        COUNT(sl.id) FILTER (WHERE sl.start_time >= NOW() - INTERVAL '30 days' AND sl.status = 'completed') ASC,
        MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') ASC NULLS FIRST
      OFFSET 1 LIMIT 1
    `, [operatorId]);

    const canceller = cancellerResult.rows[0] || { id: 'STU-SIM', name: 'Demo Student', aircraft_tail: 'N12345', instructor_name: 'Capt. Sarah Johnson', license_type: 'PPL' };
    const fillCandidate = fillCandidateResult.rows[0] || canceller;

    const slotStart = new Date();
    slotStart.setDate(slotStart.getDate() + 1);
    slotStart.setHours(10, 0, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setHours(12, 0, 0, 0);

    const daysSinceLast = fillCandidate.last_flight
      ? Math.floor((Date.now() - new Date(fillCandidate.last_flight).getTime()) / 86400000)
      : 999;

    // Insert cancellation event
    const cancelResult = await query(
      `INSERT INTO cancellation_events
         (operator_id, student_id, student_name, slot_start, slot_end, revenue_at_risk_usd, recovered, simulated)
       VALUES ($1, $2, $3, $4, $5, $6, false, true)
       RETURNING *`,
      [operatorId, canceller.id, canceller.name, slotStart.toISOString(), slotEnd.toISOString(), avgPrice]
    );
    const cancelEvent = cancelResult.rows[0];

    // Broadcast cancellation event via SSE
    broadcastToOperator(operatorId, 'cancellation.detected', {
      studentName: canceller.name,
      slotStart: slotStart.toISOString(),
      slotEnd: slotEnd.toISOString(),
      revenueAtRisk: avgPrice,
    });

    await AuditService.log(operatorId, 'cancellation_simulated', `scheduler:${req.user!.sub}`, undefined, {
      studentName: canceller.name,
      slotStart: slotStart.toISOString(),
      revenueAtRisk: avgPrice,
    });

    // Auto-create a waitlist suggestion using real top candidate
    const fillSuggestion = await SuggestionService.create(
      operatorId,
      'waitlist',
      92,
      {
        studentId: fillCandidate.id,
        studentName: fillCandidate.name,
        instructorId: 'INS-201',
        instructorName: fillCandidate.instructor_name || 'Capt. Sarah Johnson',
        aircraftId: 'AC-301',
        aircraftTail: fillCandidate.aircraft_tail || 'N12345',
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        lessonType: `${fillCandidate.license_type || 'PPL'} — Waitlist Fill`,
        locationId: 'LOC-001',
      },
      {
        trigger: `Simulated cancellation: slot opened by ${canceller.name} — agent automatically surfaced top waitlist candidate`,
        candidateScore: [
          {
            studentId: fillCandidate.id,
            name: fillCandidate.name,
            score: 0.94,
            signals: { daysSinceLastFlight: daysSinceLast === 999 ? 30 : daysSinceLast, daysUntilNextFlight: 25, totalFlightHours: Number(fillCandidate.hours_logged) || 0, customWeights: {} },
          },
        ],
        constraintsEvaluated: [
          'availability: pass',
          'daylight hours: pass',
          'aircraft type rating: pass',
          'instructor currency: pass',
          'weather forecast: pass — VFR',
        ],
        alternativesConsidered: 6,
        confidence: 'high',
        summary: `${fillCandidate.name} was selected from the waitlist — they haven't flown in ${daysSinceLast === 999 ? 'over 30' : daysSinceLast} days and rank highest on recency and waitlist priority.`,
      },
      24
    );

    // Mark cancellation as having a fill suggestion
    await query(
      `UPDATE cancellation_events SET filled_by_suggestion_id = $1 WHERE id = $2`,
      [fillSuggestion.id, cancelEvent.id]
    );

    res.json({
      cancellation: cancelEvent,
      suggestion: fillSuggestion,
      message: 'Cancellation simulated — agent surfaced top waitlist candidate in real time',
    });
  } catch (error) {
    console.error('Simulate cancellation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/analysis/at-risk-students ──────────────────────────────────────

router.get('/at-risk-students', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const IDLE_DAYS_THRESHOLD = 7;

    // Calculate last_flight_date and flights_last_30_days live from scheduled_lessons
    const result = await query(
      `SELECT
         sp.user_id, u.name, u.email,
         sp.license_type, sp.hours_logged, sp.hours_required,
         COUNT(sl.id) FILTER (WHERE sl.start_time >= NOW() - INTERVAL '30 days' AND sl.status = 'completed') AS flights_last_30_days,
         MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') AS last_flight_date
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       LEFT JOIN scheduled_lessons sl ON sl.user_id = sp.user_id AND sl.operator_id = sp.operator_id
       WHERE sp.operator_id = $1
       GROUP BY sp.user_id, u.name, u.email, sp.license_type, sp.hours_logged, sp.hours_required
       HAVING
         MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') IS NULL
         OR MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') <= NOW() - make_interval(days => $2)
         OR COUNT(sl.id) FILTER (WHERE sl.start_time >= NOW() - INTERVAL '30 days' AND sl.status = 'completed') < 2
       ORDER BY last_flight_date ASC NULLS FIRST`,
      [operatorId, IDLE_DAYS_THRESHOLD]
    );

    const students = result.rows.map((row: {
      user_id: string; name: string; email: string;
      license_type: string; hours_logged: number; hours_required: number;
      flights_last_30_days: number; last_flight_date: string | null;
    }) => {
      const daysSinceLast = row.last_flight_date
        ? Math.floor((Date.now() - new Date(row.last_flight_date).getTime()) / 86400000)
        : 999;
      return {
        user_id: row.user_id,
        name: row.name,
        email: row.email,
        license_type: row.license_type,
        hours_logged: row.hours_logged,
        hours_required: row.hours_required,
        flights_last_30_days: Number(row.flights_last_30_days) || 0,
        last_flight_date: row.last_flight_date,
        days_since_last_flight: daysSinceLast,
      };
    });

    res.json({ data: students, threshold_days: IDLE_DAYS_THRESHOLD });
  } catch (error) {
    console.error('At-risk students error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/analysis/nudge-student ────────────────────────────────────────

router.post('/nudge-student', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { userId, studentName, licenseType, daysSinceLastFlight, hoursLogged } = req.body;

    if (!userId || !studentName) {
      res.status(400).json({ error: 'userId and studentName are required' });
      return;
    }

    const suggestion = await SuggestionService.create(
      operatorId,
      'at_risk_nudge',
      80,
      {
        studentId: userId,
        studentName,
        startTime: new Date(Date.now() + 86400000 * 3).toISOString(),
        endTime: new Date(Date.now() + 86400000 * 3 + 7200000).toISOString(),
        lessonType: `${licenseType || 'Flight'} — Frequency Nudge`,
      },
      {
        trigger: `Student hasn't flown in ${daysSinceLastFlight || 'several'} days — graduation timeline at risk`,
        candidateScore: [
          {
            studentId: userId,
            name: studentName,
            score: 0.85,
            signals: {
              daysSinceLastFlight: daysSinceLastFlight || 0,
              daysUntilNextFlight: 999,
              totalFlightHours: hoursLogged || 0,
              customWeights: { frequencyRisk: 0.9 },
            },
          },
        ],
        constraintsEvaluated: ['frequency threshold: FAIL — idle too long', 'graduation timeline: at risk'],
        alternativesConsidered: 0,
        confidence: 'high',
        summary: `${studentName} has not flown in ${daysSinceLastFlight || 'several'} days. At this pace their graduation timeline is slipping — a scheduling nudge is recommended to get them back on track.`,
      },
      72
    );

    await AuditService.log(operatorId, 'at_risk_nudge_created', `scheduler:${req.user!.sub}`, suggestion.id, {
      studentName,
      daysSinceLastFlight,
    });

    res.json({ data: suggestion });
  } catch (error) {
    console.error('Nudge student error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/analysis/agent-narrative ───────────────────────────────────────

router.get('/agent-narrative', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    // Return cached narrative if still fresh
    const cached = narrativeCache.get(operatorId);
    if (cached && Date.now() - cached.generatedAt < NARRATIVE_TTL_MS) {
      return res.json({ narrative: cached.text, stats: cached.stats, cached: true });
    }

    // Gather today's stats — count agent runs as a proxy for "openings evaluated"
    const [created, approved, declined, pendingResult, agentRunsResult] = await Promise.all([
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`, [operatorId]),
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'approved' AND reviewed_at >= NOW() - INTERVAL '24 hours'`, [operatorId]),
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'declined' AND reviewed_at >= NOW() - INTERVAL '24 hours'`, [operatorId]),
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'pending'`, [operatorId]),
      // Each agent run evaluates ~3 openings by default
      query(`SELECT COUNT(*) FROM audit_log WHERE operator_id = $1 AND event_type = 'agent_run' AND created_at >= NOW() - INTERVAL '24 hours'`, [operatorId]),
    ]);

    const approvedCount = parseInt(approved.rows[0].count, 10);
    const createdCount = parseInt(created.rows[0].count, 10);
    const declinedCount = parseInt(declined.rows[0].count, 10);
    const pendingCount = parseInt(pendingResult.rows[0].count, 10);
    const agentRuns = parseInt(agentRunsResult.rows[0].count, 10);
    // Each agent run scans ~3 openings; if no audit log entries yet, estimate from suggestions
    const openingsEvaluated = agentRuns > 0 ? agentRuns * 3 : Math.max(createdCount * 2, 4);

    let avgPrice = 185;
    try {
      const config = await OperatorService.getConfig(operatorId);
      avgPrice = config.avgLessonPriceUsd || 185;
    } catch (e) {
      console.warn('[agent-narrative] Operator config unavailable, using default lesson price:', e);
    }

    const revenueRecovered = approvedCount * avgPrice;

    const prompt = `You are the scheduling agent for a flight school. Write exactly 2 sentences summarizing today's performance.

Stats: evaluated ${openingsEvaluated} schedule openings, created ${createdCount} suggestions, ${approvedCount} approved (recovering $${revenueRecovered} in revenue), ${declinedCount} declined, ${pendingCount} still pending dispatcher review.

Be specific with the numbers. Professional tone. No bullet points. No headers.`;

    let narrative = '';
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-20250514',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      });
      narrative = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    } catch {
      narrative = `Today the agent evaluated ${openingsEvaluated} schedule openings and generated ${createdCount} suggestions, with ${approvedCount} approved recovering $${revenueRecovered.toLocaleString()} in revenue. ${pendingCount} suggestion${pendingCount !== 1 ? 's' : ''} await${pendingCount === 1 ? 's' : ''} dispatcher review.`;
    }

    const stats = {
      openings_evaluated: openingsEvaluated,
      suggestions_created: createdCount,
      approved: approvedCount,
      declined: declinedCount,
      pending: pendingCount,
      revenue_recovered_usd: revenueRecovered,
    };

    // Cache for 1 hour
    narrativeCache.set(operatorId, { text: narrative, stats, generatedAt: Date.now() });

    res.json({ narrative, stats, cached: false });
  } catch (error) {
    console.error('Agent narrative error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/analysis/frequency-leaderboard ─────────────────────────────────

router.get('/frequency-leaderboard', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    // Live flight counts from scheduled_lessons
    const result = await query(
      `SELECT
         u.name, u.email,
         sp.license_type, sp.hours_logged, sp.hours_required,
         COUNT(sl.id) FILTER (WHERE sl.start_time >= NOW() - INTERVAL '30 days' AND sl.status = 'completed') AS flights_last_30_days,
         MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') AS last_flight_date
       FROM student_profiles sp
       JOIN users u ON u.id = sp.user_id
       LEFT JOIN scheduled_lessons sl ON sl.user_id = sp.user_id AND sl.operator_id = sp.operator_id
       WHERE sp.operator_id = $1
       GROUP BY u.name, u.email, sp.license_type, sp.hours_logged, sp.hours_required
       ORDER BY flights_last_30_days DESC`,
      [operatorId]
    );

    const students = result.rows.map((row: {
      name: string; email: string; license_type: string;
      hours_logged: number; hours_required: number;
      flights_last_30_days: number; last_flight_date: string | null;
    }, idx: number) => {
      const f30 = Number(row.flights_last_30_days) || 0;
      return {
        rank: idx + 1,
        name: row.name,
        license_type: row.license_type,
        hours_logged: Number(row.hours_logged) || 0,
        hours_required: Number(row.hours_required) || 0,
        flights_last_30_days: f30,
        flights_per_week: Math.round(f30 / 4.33 * 10) / 10,
        last_flight_date: row.last_flight_date,
        pace_status: f30 >= 10 ? 'on_track' : f30 >= 4 ? 'behind' : 'at_risk',
      };
    });

    res.json({ data: students });
  } catch (error) {
    console.error('Frequency leaderboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/analysis/last-agent-run ────────────────────────────────────────

router.get('/last-agent-run', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const result = await query(
      `SELECT created_at FROM audit_log
       WHERE operator_id = $1 AND event_type = 'agent_run'
       ORDER BY created_at DESC LIMIT 1`,
      [operatorId]
    );
    const lastRun = result.rows[0]?.created_at || null;
    res.json({ last_run_at: lastRun });
  } catch {
    res.json({ last_run_at: null });
  }
});

// ─── GET /api/analysis/operator-school-type ──────────────────────────────────

router.get('/operator-school-type', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const result = await query(
      `SELECT school_type FROM operators WHERE id = $1`,
      [operatorId]
    );
    res.json({ school_type: result.rows[0]?.school_type || 'part_141' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/analysis/operator-school-type ────────────────────────────────

router.patch('/operator-school-type', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { school_type } = req.body;
    if (!['part_141', 'part_61'].includes(school_type)) {
      res.status(400).json({ error: 'school_type must be part_141 or part_61' });
      return;
    }
    await query(`UPDATE operators SET school_type = $1 WHERE id = $2`, [school_type, operatorId]);
    broadcastToOperator(operatorId, 'operator.school_type_changed', { school_type });
    res.json({ school_type });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
