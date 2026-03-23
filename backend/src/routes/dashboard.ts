import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { OperatorService } from '../services/operatorService';

const router = Router();
router.use(authenticate);

const MINS_SAVED_PER_SUGGESTION = 30;

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    const [
      pendingResult,
      approvedTodayResult,
      declinedTodayResult,
      avgTimeResult,
      byTypeResult,
      allApprovedResult,
      allDeclinedResult,
      atRiskResult,
      pendingStudentRequestsResult,
      utilizationResult,
    ] = await Promise.all([
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'pending'`, [operatorId]),
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'approved' AND reviewed_at >= CURRENT_DATE`, [operatorId]),
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'declined' AND reviewed_at >= CURRENT_DATE`, [operatorId]),
      query(`SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600) as avg_hours FROM suggestions WHERE operator_id = $1 AND reviewed_at IS NOT NULL`, [operatorId]),
      query(`SELECT type, COUNT(*) as count FROM suggestions WHERE operator_id = $1 GROUP BY type`, [operatorId]),
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'approved'`, [operatorId]),
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'declined'`, [operatorId]),
      query(`SELECT COUNT(*) FROM (SELECT DISTINCT payload->>'studentId' as student_id FROM suggestions WHERE operator_id = $1 AND status = 'pending' AND (rationale->'candidateScore'->0->'signals'->>'daysSinceLastFlight')::int >= 7) sub`, [operatorId]),
      query(`SELECT COUNT(*) FROM lesson_requests WHERE operator_id = $1 AND status = 'pending_approval'`, [operatorId]),
      query(`
        SELECT
          COUNT(*) as booked_slots,
          COUNT(DISTINCT aircraft_tail) as active_aircraft,
          COUNT(DISTINCT instructor_name) as active_instructors
        FROM scheduled_lessons
        WHERE operator_id = $1
        AND start_time BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        AND status IN ('confirmed', 'completed')
      `, [operatorId]),
    ]);

    const operatorConfig = await OperatorService.getConfig(operatorId);
    const AVG_LESSON_PRICE_USD = operatorConfig.avgLessonPriceUsd || 185;

    const pending = parseInt(pendingResult.rows[0].count, 10);
    const slotsFilledByAgent = parseInt(allApprovedResult.rows[0].count, 10);
    const totalDeclined = parseInt(allDeclinedResult.rows[0].count, 10);
    const totalHandled = slotsFilledByAgent + totalDeclined + pending;
    const aircraftFillRate = totalHandled > 0 ? Math.round((slotsFilledByAgent / totalHandled) * 100) : 0;
    const timeSavedHours = parseFloat(((totalHandled * MINS_SAVED_PER_SUGGESTION) / 60).toFixed(1));
    const revenueRecovered = slotsFilledByAgent * AVG_LESSON_PRICE_USD;

    const suggestionsByType: Record<string, number> = {};
    for (const row of byTypeResult.rows) {
      suggestionsByType[row.type] = parseInt(row.count, 10);
    }

    const bookedSlots = parseInt(utilizationResult.rows[0].booked_slots, 10);
    const totalPossibleSlots = 3 * 4 * 7;
    const currentUtilization = Math.min(99, Math.round((bookedSlots / totalPossibleSlots) * 100));
    const proposedUtilization = Math.min(95, currentUtilization + Math.round(slotsFilledByAgent * 3));

    res.json({
      pending,
      approvedToday: parseInt(approvedTodayResult.rows[0].count, 10),
      declinedToday: parseInt(declinedTodayResult.rows[0].count, 10),
      avgResponseTime: Math.round(parseFloat(avgTimeResult.rows[0].avg_hours || '0') * 10) / 10,
      suggestionsByType,
      aircraftFillRate,
      slotsFilledByAgent,
      timeSavedHours,
      revenueRecovered,
      atRiskStudentCount: parseInt(atRiskResult.rows[0].count, 10),
      pendingStudentRequests: parseInt(pendingStudentRequestsResult.rows[0].count, 10),
      utilization: {
        current: currentUtilization,
        proposed: proposedUtilization,
        bookedSlots,
        activeAircraft: parseInt(utilizationResult.rows[0].active_aircraft, 10),
        activeInstructors: parseInt(utilizationResult.rows[0].active_instructors, 10),
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
