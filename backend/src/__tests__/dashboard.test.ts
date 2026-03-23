import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { config } from '../config';

jest.mock('../db/connection', () => ({
  query: jest.fn(),
  getPool: jest.fn(),
  closePool: jest.fn(),
}));

jest.mock('../services/operatorService', () => ({
  OperatorService: {
    getConfig: jest.fn().mockResolvedValue({ avgLessonPriceUsd: 185 }),
  },
}));

import { query } from '../db/connection';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRow(fields: Record<string, unknown>) {
  return { rows: [fields], rowCount: 1, command: '', oid: 0, fields: [] } as any;
}
function mockRows(rows: Record<string, unknown>[]) {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as any;
}

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
      // Promise.all fires all 10 in parallel; mockResolvedValueOnce is consumed in call order
      mockQuery
        .mockResolvedValueOnce(mockRow({ count: '5' }))          // 1. pending
        .mockResolvedValueOnce(mockRow({ count: '3' }))          // 2. approvedToday
        .mockResolvedValueOnce(mockRow({ count: '1' }))          // 3. declinedToday
        .mockResolvedValueOnce(mockRow({ avg_hours: '2.5' }))    // 4. avgTime
        .mockResolvedValueOnce(mockRows([                        // 5. byType
          { type: 'waitlist', count: '4' },
          { type: 'reschedule', count: '2' },
          { type: 'discovery', count: '1' },
        ]))
        .mockResolvedValueOnce(mockRow({ count: '10' }))         // 6. allApproved
        .mockResolvedValueOnce(mockRow({ count: '2' }))          // 7. allDeclined
        .mockResolvedValueOnce(mockRow({ count: '2' }))          // 8. atRisk
        .mockResolvedValueOnce(mockRow({ count: '0' }))          // 9. pendingStudentRequests
        .mockResolvedValueOnce(mockRow({                         // 10. utilization
          booked_slots: '12',
          active_aircraft: '3',
          active_instructors: '3',
        }));

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
      expect(res.body.slotsFilledByAgent).toBe(10);
      expect(res.body.revenueRecovered).toBe(1850);
      expect(res.body.atRiskStudentCount).toBe(2);
      expect(res.body.utilization).toBeDefined();
      expect(res.body.utilization.activeAircraft).toBe(3);
    });
  });
});
