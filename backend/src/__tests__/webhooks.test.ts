import request from 'supertest';
import { app } from '../index';

jest.mock('../db/connection', () => ({
  query: jest.fn(),
  getPool: jest.fn(),
  closePool: jest.fn(),
}));

import { query } from '../db/connection';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Webhook Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/webhooks/fsp', () => {
    it('should return 400 if required fields missing', async () => {
      const res = await request(app)
        .post('/api/webhooks/fsp')
        .send({ operatorId: 'FSP-001' });
      expect(res.status).toBe(400);
    });

    it('should return 404 if operator not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as any);
      const res = await request(app)
        .post('/api/webhooks/fsp')
        .send({ operatorId: 'BAD-ID', eventType: 'cancellation', eventId: 'ev1' });
      expect(res.status).toBe(404);
    });

    it('should store webhook event and return received:true', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'op-internal' }], rowCount: 1, command: '', oid: 0, fields: [] } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as any);

      const res = await request(app)
        .post('/api/webhooks/fsp')
        .send({
          operatorId: 'FSP-001',
          eventType: 'cancellation',
          eventId: 'ev-123',
          data: { studentId: 'STU-101', startTime: '2026-03-15T09:00:00Z' },
        });
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });
});
