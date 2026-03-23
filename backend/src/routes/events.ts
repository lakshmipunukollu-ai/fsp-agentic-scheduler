import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { addSSEClient, removeSSEClient } from '../services/sseService';
import { AuthPayload } from '../types';

const router = Router();

// GET /api/events/stream — SSE endpoint for real-time push
// Accepts token as query param because EventSource doesn't support custom headers
router.get('/stream', (req: Request, res: Response) => {
  const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  let user: AuthPayload;
  try {
    user = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = user;
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  const operatorId = user.operatorId;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial heartbeat
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', operatorId })}\n\n`);

  const client = addSSEClient(operatorId, res);

  // Keep-alive heartbeat every 25 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSSEClient(client);
  });
});

export default router;
