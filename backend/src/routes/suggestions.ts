import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { SuggestionService } from '../services/suggestionService';

const router = Router();

// All suggestion routes require authentication
router.use(authenticate);

// GET /api/suggestions - List suggestions for the operator
router.get('/', async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { status, type, page, limit } = req.query;

    const result = await SuggestionService.getByOperator(operatorId, {
      status: status as string,
      type: type as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/suggestions/:id - Get single suggestion
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const suggestion = await SuggestionService.getById(req.user!.operatorId, req.params.id);
    res.json({ data: suggestion });
  } catch (error: any) {
    if (error.statusCode === 404) {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/suggestions/:id/approve - Approve suggestion
router.post('/:id/approve', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const suggestion = await SuggestionService.approve(
      req.user!.operatorId,
      req.params.id,
      req.user!.sub,
      req.body.notes
    );
    res.json({ data: suggestion });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/suggestions/:id/decline - Decline suggestion
router.post('/:id/decline', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const suggestion = await SuggestionService.decline(
      req.user!.operatorId,
      req.params.id,
      req.user!.sub,
      req.body.reason
    );
    res.json({ data: suggestion });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/suggestions/bulk-approve-high-confidence — approve all pending high-confidence suggestions
router.post('/bulk-approve-high-confidence', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;
    const { query: dbQuery } = await import('../db/connection');
    const result = await dbQuery(
      `SELECT id FROM suggestions
       WHERE operator_id = $1
         AND status = 'pending'
         AND rationale->>'confidence' = 'high'
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(COALESCE(rationale->'constraintsEvaluated', '[]'::jsonb)) AS c
           WHERE c ILIKE '%FAIL%'
         )`,
      [operatorId]
    );
    const ids = result.rows.map((r: { id: string }) => r.id);
    if (ids.length === 0) {
      res.json({ approved: 0, failed: [], message: 'No high-confidence suggestions available' });
      return;
    }
    const approveResult = await SuggestionService.bulkApprove(operatorId, ids, req.user!.sub);
    res.json(approveResult);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/suggestions/bulk-approve
router.post('/bulk-approve', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }
    const result = await SuggestionService.bulkApprove(req.user!.operatorId, ids, req.user!.sub);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/suggestions/bulk-decline
router.post('/bulk-decline', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const { ids, reason } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }
    const result = await SuggestionService.bulkDecline(req.user!.operatorId, ids, req.user!.sub, reason);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
