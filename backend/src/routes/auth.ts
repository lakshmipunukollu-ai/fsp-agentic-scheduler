import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection';
import { config } from '../config';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, operatorId: user.operator_id },
      config.jwtSecret,
      { expiresIn: 86400 }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        operatorId: user.operator_id,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, operatorId } = req.body;

    if (!email || !password || !name || !operatorId) {
      res.status(400).json({ error: 'Email, password, name, and operatorId are required' });
      return;
    }

    // Check if operator exists
    const opResult = await query('SELECT id FROM operators WHERE id = $1', [operatorId]);
    if (opResult.rows.length === 0) {
      res.status(400).json({ error: 'Invalid operator ID' });
      return;
    }

    // Check if email exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (operator_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'scheduler')
       RETURNING id, operator_id, email, name, role, created_at`,
      [operatorId, email, passwordHash, name]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { sub: user.id, role: user.role, operatorId: user.operator_id },
      config.jwtSecret,
      { expiresIn: 86400 }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        operatorId: user.operator_id,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
