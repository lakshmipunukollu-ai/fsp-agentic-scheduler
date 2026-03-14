import request from 'supertest';
import { app } from '../index';

// Mock the database connection
jest.mock('../db/connection', () => ({
  query: jest.fn(),
  getPool: jest.fn(),
  closePool: jest.fn(),
}));

import { query } from '../db/connection';
import bcrypt from 'bcryptjs';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 if email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'test123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email and password are required');
    });

    it('should return 400 if password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email and password are required');
    });

    it('should return 401 if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as any);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'test123' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 401 if password is wrong', async () => {
      const hash = await bcrypt.hash('correct', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'test@test.com', password_hash: hash, name: 'Test', role: 'admin', operator_id: 'op1' }],
        rowCount: 1, command: '', oid: 0, fields: [],
      } as any);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('should return token on successful login', async () => {
      const hash = await bcrypt.hash('correct', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'test@test.com', password_hash: hash, name: 'Test User', role: 'admin', operator_id: 'op1' }],
        rowCount: 1, command: '', oid: 0, fields: [],
      } as any);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'correct' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('test@test.com');
      expect(res.body.user.name).toBe('Test User');
      expect(res.body.user.role).toBe('admin');
    });
  });

  describe('POST /api/auth/register', () => {
    it('should return 400 if required fields missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
    });

    it('should return 400 if operator does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as any);
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@test.com', password: 'test123', name: 'New User', operatorId: 'bad-id' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid operator ID');
    });

    it('should return 409 if email already exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'op1' }], rowCount: 1, command: '', oid: 0, fields: [] } as any)
        .mockResolvedValueOnce({ rows: [{ id: 'u1' }], rowCount: 1, command: '', oid: 0, fields: [] } as any);
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'exists@test.com', password: 'test123', name: 'Exists', operatorId: 'op1' });
      expect(res.status).toBe(409);
    });

    it('should register a new user successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'op1' }], rowCount: 1, command: '', oid: 0, fields: [] } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as any)
        .mockResolvedValueOnce({
          rows: [{ id: 'u-new', operator_id: 'op1', email: 'new@test.com', name: 'New User', role: 'scheduler', created_at: new Date().toISOString() }],
          rowCount: 1, command: '', oid: 0, fields: [],
        } as any);
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@test.com', password: 'test123', name: 'New User', operatorId: 'op1' });
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('new@test.com');
      expect(res.body.user.role).toBe('scheduler');
    });
  });
});
