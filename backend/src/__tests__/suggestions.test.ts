import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { config } from '../config';

// Mock the database connection
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

const mockSuggestion = {
  id: 's1',
  operator_id: 'op1',
  type: 'waitlist',
  status: 'pending',
  priority: 90,
  payload: { studentId: 'STU-101', studentName: 'John', startTime: '2026-03-15T09:00:00Z', endTime: '2026-03-15T11:00:00Z' },
  rationale: { trigger: 'Cancellation', candidateScore: [], constraintsEvaluated: [], alternativesConsidered: 5, confidence: 'high' },
  created_at: '2026-03-14T00:00:00Z',
};

describe('Suggestion Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/suggestions', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/suggestions');
      expect(res.status).toBe(401);
    });

    it('should return paginated suggestions', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1, command: '', oid: 0, fields: [] } as any)
        .mockResolvedValueOnce({ rows: [mockSuggestion], rowCount: 1, command: '', oid: 0, fields: [] } as any);

      const res = await request(app)
        .get('/api/suggestions')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1, command: '', oid: 0, fields: [] } as any)
        .mockResolvedValueOnce({ rows: [mockSuggestion], rowCount: 1, command: '', oid: 0, fields: [] } as any);

      const res = await request(app)
        .get('/api/suggestions?status=pending')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/suggestions/:id', () => {
    it('should return a single suggestion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSuggestion], rowCount: 1, command: '', oid: 0, fields: [] } as any);
      const res = await request(app)
        .get('/api/suggestions/s1')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('s1');
    });

    it('should return 404 for nonexistent suggestion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as any);
      const res = await request(app)
        .get('/api/suggestions/nope')
        .set('Authorization', `Bearer ${makeToken()}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/suggestions/:id/approve', () => {
    it('should return 403 for viewer role', async () => {
      const res = await request(app)
        .post('/api/suggestions/s1/approve')
        .set('Authorization', `Bearer ${makeToken('viewer')}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it('should approve a pending suggestion', async () => {
      // getById
      mockQuery.mockResolvedValueOnce({ rows: [mockSuggestion], rowCount: 1, command: '', oid: 0, fields: [] } as any);
      // update
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockSuggestion, status: 'approved' }], rowCount: 1, command: '', oid: 0, fields: [] } as any);
      // audit log
      mockQuery.mockResolvedValueOnce({ rows: [{}], rowCount: 1, command: '', oid: 0, fields: [] } as any);

      const res = await request(app)
        .post('/api/suggestions/s1/approve')
        .set('Authorization', `Bearer ${makeToken('scheduler')}`)
        .send({ notes: 'Looks good' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('approved');
    });

    it('should return 400 for already approved suggestion', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...mockSuggestion, status: 'approved' }],
        rowCount: 1, command: '', oid: 0, fields: [],
      } as any);

      const res = await request(app)
        .post('/api/suggestions/s1/approve')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/suggestions/:id/decline', () => {
    it('should decline a pending suggestion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockSuggestion], rowCount: 1, command: '', oid: 0, fields: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ ...mockSuggestion, status: 'declined' }], rowCount: 1, command: '', oid: 0, fields: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{}], rowCount: 1, command: '', oid: 0, fields: [] } as any);

      const res = await request(app)
        .post('/api/suggestions/s1/decline')
        .set('Authorization', `Bearer ${makeToken('scheduler')}`)
        .send({ reason: 'Student unavailable' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('declined');
    });
  });

  describe('POST /api/suggestions/bulk-approve', () => {
    it('should return 400 if ids not provided', async () => {
      const res = await request(app)
        .post('/api/suggestions/bulk-approve')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('should bulk approve suggestions', async () => {
      // Two suggestions, each needing getById + update + audit
      for (let i = 0; i < 2; i++) {
        mockQuery.mockResolvedValueOnce({ rows: [{ ...mockSuggestion, id: `s${i}` }], rowCount: 1, command: '', oid: 0, fields: [] } as any);
        mockQuery.mockResolvedValueOnce({ rows: [{ ...mockSuggestion, id: `s${i}`, status: 'approved' }], rowCount: 1, command: '', oid: 0, fields: [] } as any);
        mockQuery.mockResolvedValueOnce({ rows: [{}], rowCount: 1, command: '', oid: 0, fields: [] } as any);
      }

      const res = await request(app)
        .post('/api/suggestions/bulk-approve')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ ids: ['s0', 's1'] });
      expect(res.status).toBe(200);
      expect(res.body.approved).toBe(2);
      expect(res.body.failed).toEqual([]);
    });
  });
});
