import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { config } from '../config';

jest.mock('../db/connection', () => ({
  query: jest.fn(),
  getPool: jest.fn(),
  closePool: jest.fn(),
}));

import { query } from '../db/connection';

const mockQuery = query as jest.MockedFunction<typeof query>;

function makeToken(role: string = 'admin', operatorId: string = 'op1') {
  return jwt.sign({ sub: 'u1', role, operatorId }, config.jwtSecret, { expiresIn: 3600 });
}

describe('Dashboard Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/dashboard/stats', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/dashboard/stats');
      expect(res.status).toBe(401);
    });

    it('should return dashboard stats', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1, command: '', oid: 0, fields: [] } as any)  // pending
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1, command: '', oid: 0, fields: [] } as any)  // approved today
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1, command: '', oid: 0, fields: [] } as any)  // declined today
        .mockResolvedValueOnce({ rows: [{ avg_hours: '2.5' }], rowCount: 1, command: '', oid: 0, fields: [] } as any)  // avg time
        .mockResolvedValueOnce({
          rows: [
            { type: 'waitlist', count: '4' },
            { type: 'reschedule', count: '2' },
            { type: 'discovery', count: '1' },
          ],
          rowCount: 3, command: '', oid: 0, fields: [],
        } as any);  // by type

      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.pending).toBe(5);
      expect(res.body.approvedToday).toBe(3);
      expect(res.body.declinedToday).toBe(1);
      expect(res.body.avgResponseTime).toBe(2.5);
      expect(res.body.suggestionsByType.waitlist).toBe(4);
      expect(res.body.suggestionsByType.reschedule).toBe(2);
    });
  });
});
