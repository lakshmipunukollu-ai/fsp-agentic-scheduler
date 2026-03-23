import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { config } from '../config';

jest.mock('../db/connection', () => ({
  query: jest.fn(),
  getPool: jest.fn(),
  closePool: jest.fn(),
}));

jest.mock('../services/sseService', () => ({
  broadcastToOperator: jest.fn(),
}));

jest.mock('../services/notificationService', () => ({
  NotificationService: {
    sendStaffStudentScheduleSubmittedSMS: jest.fn().mockResolvedValue(undefined),
    sendStudentTransactionalEmail: jest.fn().mockResolvedValue(undefined),
  },
}));

import { query } from '../db/connection';
import { NotificationService } from '../services/notificationService';

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockRow(fields: Record<string, unknown>) {
  return { rows: [fields], rowCount: 1, command: '', oid: 0, fields: [] } as any;
}
function mockRows(rows: Record<string, unknown>[]) {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as any;
}

function makeToken(role: string = 'student', operatorId: string = 'op1', sub: string = 'stu-1') {
  return jwt.sign({ sub, role, operatorId }, config.jwtSecret, { expiresIn: 3600 });
}

const slot = {
  date: '2025-06-01',
  startTime: '09:00',
  endTime: '11:00',
  lessonNumber: 1,
  durationHours: 2,
  lessonType: 'Dual',
  instructorName: 'Inst',
  aircraftTail: 'N12345',
};

describe('POST /api/students/lesson-requests/:requestId/submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/students/lesson-requests/550e8400-e29b-41d4-a716-446655440000/submit')
      .send({ aiSchedule: [slot] });
    expect(res.status).toBe(401);
  });

  it('returns 400 when request is not pending_approval', async () => {
    mockQuery.mockResolvedValueOnce(
      mockRow({ id: 'rid', status: 'approved', student_name: 'Test Student' })
    );
    const res = await request(app)
      .post('/api/students/lesson-requests/550e8400-e29b-41d4-a716-446655440000/submit')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ aiSchedule: [slot] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no longer pending/);
  });

  it('persists schedule, notifies staff SMS helper, and returns ok', async () => {
    mockQuery
      .mockResolvedValueOnce(
        mockRow({ id: 'rid', status: 'pending_approval', student_name: 'Test Student' })
      )
      .mockResolvedValueOnce(mockRows([]))
      .mockResolvedValueOnce(mockRow({ id: 'sug-uuid' }))
      .mockResolvedValueOnce(mockRows([{ id: 'adm', name: 'Admin User', phone: '+15551234567' }]))
      .mockResolvedValueOnce(mockRows([]))
      .mockResolvedValueOnce(mockRows([]))
      .mockResolvedValueOnce(mockRows([]));

    const res = await request(app)
      .post('/api/students/lesson-requests/550e8400-e29b-41d4-a716-446655440000/submit')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ aiSchedule: [slot] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.suggestionId).toBe('sug-uuid');
    expect(NotificationService.sendStaffStudentScheduleSubmittedSMS).toHaveBeenCalledWith(
      'op1',
      expect.objectContaining({
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        studentName: 'Test Student',
        lessonCount: 1,
      })
    );
  });
});
