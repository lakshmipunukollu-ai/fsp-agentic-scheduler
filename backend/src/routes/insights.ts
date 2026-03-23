import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { query } from '../db/connection';

const router = Router();
router.use(authenticate);

// GET /api/insights — Agent effectiveness analytics + common decline reasons
router.get('/', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    const [
      acceptanceByType,
      acceptanceByConfidence,
      declineReasons,
      acceptanceOverTime,
    ] = await Promise.all([
      // Acceptance rate by suggestion type
      query(`
        SELECT
          type,
          COUNT(*) FILTER (WHERE status = 'approved') AS approved,
          COUNT(*) FILTER (WHERE status = 'declined') AS declined,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) AS total,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'approved')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE status IN ('approved','declined')), 0) * 100, 1
          ) AS acceptance_rate
        FROM suggestions
        WHERE operator_id = $1
        GROUP BY type
        ORDER BY acceptance_rate DESC NULLS LAST
      `, [operatorId]),

      // Acceptance rate by confidence level
      query(`
        SELECT
          rationale->>'confidence' AS confidence,
          COUNT(*) FILTER (WHERE status = 'approved') AS approved,
          COUNT(*) FILTER (WHERE status = 'declined') AS declined,
          COUNT(*) AS total,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'approved')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE status IN ('approved','declined')), 0) * 100, 1
          ) AS acceptance_rate
        FROM suggestions
        WHERE operator_id = $1
        GROUP BY rationale->>'confidence'
        ORDER BY acceptance_rate DESC NULLS LAST
      `, [operatorId]),

      // Top decline reasons from audit log (last 30 days)
      query(`
        SELECT
          payload->>'reason' AS reason,
          COUNT(*) AS count
        FROM audit_log
        WHERE operator_id = $1
          AND event_type = 'suggestion_declined'
          AND payload->>'reason' IS NOT NULL
          AND payload->>'reason' != ''
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY payload->>'reason'
        ORDER BY count DESC
        LIMIT 5
      `, [operatorId]),

      // Daily acceptance rates for last 14 days
      query(`
        SELECT
          DATE(reviewed_at) AS day,
          COUNT(*) FILTER (WHERE status = 'approved') AS approved,
          COUNT(*) FILTER (WHERE status = 'declined') AS declined,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'approved')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE status IN ('approved','declined')), 0) * 100, 1
          ) AS rate
        FROM suggestions
        WHERE operator_id = $1
          AND reviewed_at >= NOW() - INTERVAL '14 days'
          AND status IN ('approved', 'declined')
        GROUP BY DATE(reviewed_at)
        ORDER BY day ASC
      `, [operatorId]),
    ]);

    // Overall acceptance rate
    const totalApproved = acceptanceByType.rows.reduce((s: number, r: { approved: string }) => s + parseInt(r.approved, 10), 0);
    const totalDeclined = acceptanceByType.rows.reduce((s: number, r: { declined: string }) => s + parseInt(r.declined, 10), 0);
    const overallRate = totalApproved + totalDeclined > 0
      ? Math.round((totalApproved / (totalApproved + totalDeclined)) * 100)
      : 0;

    res.json({
      overallAcceptanceRate: overallRate,
      totalApproved,
      totalDeclined,
      byType: acceptanceByType.rows,
      byConfidence: acceptanceByConfidence.rows,
      topDeclineReasons: declineReasons.rows,
      dailyTrend: acceptanceOverTime.rows,
    });
  } catch (error) {
    console.error('Insights error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
