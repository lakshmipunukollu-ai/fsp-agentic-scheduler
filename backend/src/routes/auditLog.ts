import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AuditService } from '../services/auditService';

const router = Router();

router.use(authenticate);

// GET /api/audit-log
router.get('/', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { suggestion_id, page, limit } = req.query;

    const result = await AuditService.getByOperator(operatorId, {
      suggestionId: suggestion_id as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
