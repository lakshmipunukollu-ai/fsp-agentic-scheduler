import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { config } from '../config';

jest.mock('../db/connection', () => ({
  query: jest.fn(),
  getPool: jest.fn(),
  closePool: jest.fn(),
}));

jest.mock('@anthropic-ai/sdk', () => {
  const create = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Today the agent performed well with 3 suggestions created.' }],
  });
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: { create },
  }));
  return { __esModule: true, default: MockAnthropic };
});

import { query } from '../db/connection';
const mockQuery = query as jest.MockedFunction<typeof query>;

function makeToken(role = 'admin', operatorId = 'op1') {
  return jwt.sign({ sub: 'u1', role, operatorId }, config.jwtSecret, { expiresIn: 3600 });
}

const emptyRows = { rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as any;
const countRow = (n: number) => ({ rows: [{ count: String(n) }], rowCount: 1, command: '', oid: 0, fields: [] } as any);
const configRow = { rows: [{ config: { avgLessonPriceUsd: 185 }, feature_flags: {} }], rowCount: 1, command: '', oid: 0, fields: [] } as any;

describe('Analysis Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/analysis/graduation-risk', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/analysis/graduation-risk');
      expect(res.status).toBe(401);
    });

    it('returns student graduation risk data', async () => {
      mockQuery
        .mockResolvedValueOnce(configRow)  // operator config
        .mockResolvedValueOnce({
          rows: [{
            user_id: 'stu-1', name: 'Emma White', email: 'emma@test.com',
            license_type: 'PPL', hours_logged: '22', hours_required: '40',
            flights_last_30_days: '4', last_flight_date: '2026-03-10',
          }],
          rowCount: 1, command: '', oid: 0, fields: [],
        } as any);

      const res = await request(app)
        .get('/api/analysis/graduation-risk')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toHaveProperty('projected_graduation_hours');
      expect(res.body.data[0]).toHaveProperty('extra_cost_usd');
      expect(res.body.data[0]).toHaveProperty('risk_level');
    });
  });

  describe('GET /api/analysis/revenue-breakdown', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/analysis/revenue-breakdown');
      expect(res.status).toBe(401);
    });

    it('returns revenue breakdown metrics', async () => {
      mockQuery
        .mockResolvedValueOnce(configRow)          // operator config
        .mockResolvedValueOnce(countRow(3))         // approved this month
        .mockResolvedValueOnce(countRow(2))         // pending
        .mockResolvedValueOnce({
          rows: [{ total: '5', recovered: '3', still_at_risk: '370.00' }],
          rowCount: 1, command: '', oid: 0, fields: [],
        } as any)                                   // cancellation events
        .mockResolvedValueOnce(emptyRows)           // at-risk students for projected loss
        .mockResolvedValueOnce(countRow(8));        // total suggestions this month

      const res = await request(app)
        .get('/api/analysis/revenue-breakdown')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('opportunity_found_usd');
      expect(res.body).toHaveProperty('revenue_recovered_usd');
      expect(res.body).toHaveProperty('revenue_at_risk_usd');
      expect(res.body).toHaveProperty('avg_lesson_price_usd', 185);
    });
  });

  describe('GET /api/analysis/cancellation-stats', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/analysis/cancellation-stats');
      expect(res.status).toBe(401);
    });

    it('returns cancellation stats with agent vs manual comparison', async () => {
      mockQuery
        .mockResolvedValueOnce(configRow)
        .mockResolvedValueOnce({
          rows: [{ total: '10', filled: '7', recovered_usd: '1295.00', at_risk_usd: '555.00' }],
          rowCount: 1, command: '', oid: 0, fields: [],
        } as any);

      const res = await request(app)
        .get('/api/analysis/cancellation-stats')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_cancellations', 10);
      expect(res.body).toHaveProperty('filled_by_agent', 7);
      expect(res.body).toHaveProperty('recovery_rate_pct', 70);
      expect(res.body).toHaveProperty('without_agent');
      expect(res.body.without_agent).toHaveProperty('recovery_rate_pct', 12);
      expect(res.body.without_agent).toHaveProperty('baseline_note');
    });
  });

  describe('GET /api/analysis/at-risk-students', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/analysis/at-risk-students');
      expect(res.status).toBe(401);
    });

    it('returns at-risk students list', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'stu-2', name: 'Marcus Johnson', email: 'marcus@test.com',
          license_type: 'IR', hours_logged: 78, hours_required: 100,
          flights_last_30_days: 1, last_flight_date: '2026-03-01',
        }],
        rowCount: 1, command: '', oid: 0, fields: [],
      } as any);

      const res = await request(app)
        .get('/api/analysis/at-risk-students')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('threshold_days', 7);
      expect(res.body.data[0]).toHaveProperty('days_since_last_flight');
    });
  });

  describe('GET /api/analysis/frequency-leaderboard', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/analysis/frequency-leaderboard');
      expect(res.status).toBe(401);
    });

    it('returns students ranked by flight frequency', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { name: 'Emma White', email: 'emma@test.com', license_type: 'PPL', hours_logged: 45, hours_required: 40, flights_last_30_days: 12, last_flight_date: '2026-03-18' },
          { name: 'Ryan Chen', email: 'ryan@test.com', license_type: 'PPL', hours_logged: 22, hours_required: 40, flights_last_30_days: 3, last_flight_date: '2026-03-15' },
        ],
        rowCount: 2, command: '', oid: 0, fields: [],
      } as any);

      const res = await request(app)
        .get('/api/analysis/frequency-leaderboard')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0]).toHaveProperty('rank', 1);
      expect(res.body.data[0]).toHaveProperty('flights_per_week');
      expect(res.body.data[0]).toHaveProperty('pace_status', 'on_track'); // 12 flights/30d ≥ 10
      expect(res.body.data[1]).toHaveProperty('pace_status', 'at_risk');  // 3 flights/30d < 4
    });
  });

  describe('GET /api/analysis/agent-narrative', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/analysis/agent-narrative');
      expect(res.status).toBe(401);
    });

    it('returns narrative text and stats', async () => {
      mockQuery
        .mockResolvedValueOnce(countRow(3))   // created
        .mockResolvedValueOnce(countRow(2))   // approved
        .mockResolvedValueOnce(countRow(1))   // declined
        .mockResolvedValueOnce(countRow(0))   // pending
        .mockResolvedValueOnce(countRow(1))   // agent runs
        .mockResolvedValueOnce(configRow);    // operator config

      const res = await request(app)
        .get('/api/analysis/agent-narrative')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('narrative');
      expect(typeof res.body.narrative).toBe('string');
      expect(res.body).toHaveProperty('stats');
      expect(res.body.stats).toHaveProperty('suggestions_created');
    });
  });

  describe('GET /api/analysis/operator-school-type', () => {
    it('returns current school type', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ school_type: 'part_141' }],
        rowCount: 1, command: '', oid: 0, fields: [],
      } as any);

      const res = await request(app)
        .get('/api/analysis/operator-school-type')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('school_type', 'part_141');
    });
  });

  describe('PATCH /api/analysis/operator-school-type', () => {
    it('returns 403 for non-admin', async () => {
      const res = await request(app)
        .patch('/api/analysis/operator-school-type')
        .set('Authorization', `Bearer ${makeToken('scheduler')}`)
        .send({ school_type: 'part_61' });

      expect(res.status).toBe(403);
    });

    it('validates school_type value', async () => {
      const res = await request(app)
        .patch('/api/analysis/operator-school-type')
        .set('Authorization', `Bearer ${makeToken('admin')}`)
        .send({ school_type: 'invalid_type' });

      expect(res.status).toBe(400);
    });

    it('updates school type for admin', async () => {
      mockQuery.mockResolvedValueOnce(emptyRows);  // UPDATE

      const res = await request(app)
        .patch('/api/analysis/operator-school-type')
        .set('Authorization', `Bearer ${makeToken('admin')}`)
        .send({ school_type: 'part_61' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('school_type', 'part_61');
    });
  });

  describe('GET /api/analysis/last-agent-run', () => {
    it('returns last agent run timestamp', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: '2026-03-20T10:00:00Z' }],
        rowCount: 1, command: '', oid: 0, fields: [],
      } as any);

      const res = await request(app)
        .get('/api/analysis/last-agent-run')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('last_run_at', '2026-03-20T10:00:00Z');
    });

    it('returns null when agent has never run', async () => {
      mockQuery.mockResolvedValueOnce(emptyRows);

      const res = await request(app)
        .get('/api/analysis/last-agent-run')
        .set('Authorization', `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.last_run_at).toBeNull();
    });
  });
});
