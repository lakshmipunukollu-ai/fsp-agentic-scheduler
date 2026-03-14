import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { query } from '../db/connection';

const router = Router();

router.use(authenticate);

// GET /api/dashboard/stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    // Pending count
    const pendingResult = await query(
      `SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'pending'`,
      [operatorId]
    );

    // Approved today
    const approvedResult = await query(
      `SELECT COUNT(*) FROM suggestions
       WHERE operator_id = $1 AND status = 'approved'
       AND reviewed_at >= CURRENT_DATE`,
      [operatorId]
    );

    // Declined today
    const declinedResult = await query(
      `SELECT COUNT(*) FROM suggestions
       WHERE operator_id = $1 AND status = 'declined'
       AND reviewed_at >= CURRENT_DATE`,
      [operatorId]
    );

    // Average response time (in hours)
    const avgTimeResult = await query(
      `SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600) as avg_hours
       FROM suggestions
       WHERE operator_id = $1 AND reviewed_at IS NOT NULL`,
      [operatorId]
    );

    // Suggestions by type
    const byTypeResult = await query(
      `SELECT type, COUNT(*) as count FROM suggestions
       WHERE operator_id = $1
       GROUP BY type`,
      [operatorId]
    );

    const suggestionsByType: Record<string, number> = {};
    for (const row of byTypeResult.rows) {
      suggestionsByType[row.type] = parseInt(row.count, 10);
    }

    res.json({
      pending: parseInt(pendingResult.rows[0].count, 10),
      approvedToday: parseInt(approvedResult.rows[0].count, 10),
      declinedToday: parseInt(declinedResult.rows[0].count, 10),
      avgResponseTime: parseFloat(avgTimeResult.rows[0].avg_hours || '0'),
      suggestionsByType,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
