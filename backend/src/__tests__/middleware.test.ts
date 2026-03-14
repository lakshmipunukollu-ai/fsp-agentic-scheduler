import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { errorHandler, AppError } from '../middleware/errorHandler';
import { config } from '../config';

describe('Auth Middleware', () => {
  const testApp = express();
  testApp.use(express.json());

  testApp.get('/protected', authenticate, (_req, res) => {
    res.json({ user: _req.user });
  });

  testApp.get('/admin-only', authenticate, requireRole('admin'), (_req, res) => {
    res.json({ ok: true });
  });

  testApp.get('/scheduler-or-admin', authenticate, requireRole('admin', 'scheduler'), (_req, res) => {
    res.json({ ok: true });
  });

  it('should return 401 when no auth header', async () => {
    const res = await request(testApp).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('should return 401 with invalid token', async () => {
    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('should authenticate with valid token', async () => {
    const token = jwt.sign({ sub: 'u1', role: 'admin', operatorId: 'op1' }, config.jwtSecret, { expiresIn: 3600 });
    const res = await request(testApp)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.sub).toBe('u1');
  });

  it('should reject non-admin from admin-only route', async () => {
    const token = jwt.sign({ sub: 'u1', role: 'viewer', operatorId: 'op1' }, config.jwtSecret, { expiresIn: 3600 });
    const res = await request(testApp)
      .get('/admin-only')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('should allow admin to admin-only route', async () => {
    const token = jwt.sign({ sub: 'u1', role: 'admin', operatorId: 'op1' }, config.jwtSecret, { expiresIn: 3600 });
    const res = await request(testApp)
      .get('/admin-only')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('should allow scheduler to scheduler-or-admin route', async () => {
    const token = jwt.sign({ sub: 'u1', role: 'scheduler', operatorId: 'op1' }, config.jwtSecret, { expiresIn: 3600 });
    const res = await request(testApp)
      .get('/scheduler-or-admin')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('Error Handler', () => {
  const testApp = express();

  testApp.get('/app-error', (_req, _res, next) => {
    next(new AppError('Not found', 404));
  });

  testApp.get('/server-error', (_req, _res, next) => {
    next(new Error('something broke'));
  });

  testApp.use(errorHandler);

  it('should handle AppError with proper status code', async () => {
    const res = await request(testApp).get('/app-error');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  it('should handle generic errors with 500', async () => {
    const res = await request(testApp).get('/server-error');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});
