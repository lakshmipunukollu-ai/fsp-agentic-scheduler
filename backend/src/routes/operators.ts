import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { OperatorService } from '../services/operatorService';

const router = Router();

router.use(authenticate);

// GET /api/operators/:id/config
router.get('/:id/config', async (req: Request, res: Response) => {
  try {
    if (req.params.id !== req.user!.operatorId) {
      res.status(403).json({ error: 'Access denied to this operator' });
      return;
    }
    const config = await OperatorService.getConfig(req.params.id);
    res.json({ data: config });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/operators/:id/config
router.put('/:id/config', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    if (req.params.id !== req.user!.operatorId) {
      res.status(403).json({ error: 'Access denied to this operator' });
      return;
    }
    const config = await OperatorService.updateConfig(req.params.id, req.body, req.user!.sub);
    res.json({ data: config });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/operators/:id/feature-flags
router.get('/:id/feature-flags', async (req: Request, res: Response) => {
  try {
    if (req.params.id !== req.user!.operatorId) {
      res.status(403).json({ error: 'Access denied to this operator' });
      return;
    }
    const flags = await OperatorService.getFeatureFlags(req.params.id);
    res.json({ data: flags });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/operators/:id/feature-flags
router.put('/:id/feature-flags', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    if (req.params.id !== req.user!.operatorId) {
      res.status(403).json({ error: 'Access denied to this operator' });
      return;
    }
    const flags = await OperatorService.updateFeatureFlags(req.params.id, req.body, req.user!.sub);
    res.json({ data: flags });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
