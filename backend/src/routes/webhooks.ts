import { Router, Request, Response } from 'express';
import { query } from '../db/connection';

const router = Router();

// POST /api/webhooks/fsp - Receive FSP webhook events
// No auth - webhooks are authenticated by FSP's own mechanism
router.post('/fsp', async (req: Request, res: Response) => {
  try {
    const { operatorId, eventType, eventId, data } = req.body;

    if (!operatorId || !eventType || !eventId) {
      res.status(400).json({ error: 'operatorId, eventType, and eventId are required' });
      return;
    }

    // Look up operator by FSP operator ID
    const opResult = await query(
      'SELECT id FROM operators WHERE fsp_operator_id = $1',
      [operatorId]
    );

    if (opResult.rows.length === 0) {
      res.status(404).json({ error: 'Operator not found' });
      return;
    }

    const internalOperatorId = opResult.rows[0].id;

    // Store the event for processing by ScheduleWatcher
    await query(
      `INSERT INTO schedule_events (operator_id, fsp_event_id, event_type, event_data)
       VALUES ($1, $2, $3, $4)`,
      [internalOperatorId, eventId, eventType, JSON.stringify(data || {})]
    );

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
