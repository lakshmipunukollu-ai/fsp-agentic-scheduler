import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { AuditService } from '../services/auditService';

const router = Router();
router.use(authenticate);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (t.length === 0) return null;
  if (t.length > 32) return '';
  if (!/^[\d+\-\s().]{7,32}$/.test(t)) return '';
  return t;
}

/** GET /api/me/contact — email & phone used for notifications and login email */
router.get('/contact', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const operatorId = req.user!.operatorId;
    const r = await query(`SELECT email, phone, name FROM users WHERE id = $1 AND operator_id = $2`, [userId, operatorId]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const row = r.rows[0] as { email: string; phone: string | null; name: string };
    res.json({ email: row.email, phone: row.phone ?? null, name: row.name });
  } catch (e) {
    console.error('GET /me/contact:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PATCH /api/me/contact — update login email and/or mobile for alerts (all roles) */
router.patch('/contact', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const operatorId = req.user!.operatorId;
    const body = req.body as { email?: string; phone?: string | null };

    const cur = await query(`SELECT email, phone FROM users WHERE id = $1 AND operator_id = $2`, [userId, operatorId]);
    if (cur.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const current = cur.rows[0] as { email: string; phone: string | null };

    let nextEmail = current.email;
    if (body.email !== undefined) {
      const e = String(body.email).trim().toLowerCase();
      if (!EMAIL_RE.test(e)) {
        res.status(400).json({ error: 'Invalid email address' });
        return;
      }
      const dup = await query(`SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 AND id != $2`, [e, userId]);
      if (dup.rows.length > 0) {
        res.status(409).json({ error: 'That email is already in use' });
        return;
      }
      nextEmail = e;
    }

    let nextPhone: string | null = current.phone;
    if (body.phone !== undefined) {
      if (body.phone === null || body.phone === '') {
        nextPhone = null;
      } else {
        const p = normalizePhone(body.phone);
        if (p === '') {
          res.status(400).json({ error: 'Invalid phone number (use digits, spaces, or +country code)' });
          return;
        }
        nextPhone = p;
      }
    }

    if (nextEmail === current.email && nextPhone === current.phone) {
      res.json({ email: nextEmail, phone: nextPhone });
      return;
    }

    await query(`UPDATE users SET email = $1, phone = $2 WHERE id = $3`, [nextEmail, nextPhone, userId]);

    await AuditService.log(operatorId, 'user_contact_updated', `user:${userId}`, undefined, {
      emailChanged: nextEmail !== current.email,
      phoneChanged: nextPhone !== current.phone,
    });

    res.json({ email: nextEmail, phone: nextPhone });
  } catch (e) {
    console.error('PATCH /me/contact:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
