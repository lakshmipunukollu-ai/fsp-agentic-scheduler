import { query } from '../db/connection';
import { AuditEntry } from '../types';

export class AuditService {
  static async log(
    operatorId: string,
    eventType: string,
    actor: string,
    suggestionId?: string,
    payload?: Record<string, unknown>
  ): Promise<AuditEntry> {
    const result = await query(
      `INSERT INTO audit_log (operator_id, suggestion_id, event_type, actor, payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [operatorId, suggestionId || null, eventType, actor, payload ? JSON.stringify(payload) : null]
    );
    return result.rows[0];
  }

  static async getByOperator(
    operatorId: string,
    options: { suggestionId?: string; page?: number; limit?: number } = {}
  ): Promise<{ data: AuditEntry[]; total: number }> {
    const { suggestionId, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE operator_id = $1';
    const params: unknown[] = [operatorId];

    if (suggestionId) {
      whereClause += ` AND suggestion_id = $${params.length + 1}`;
      params.push(suggestionId);
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM audit_log ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT * FROM audit_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  /** Counts for the current local calendar day (server TZ) — used for Activity Feed summary tiles. */
  static async getTodaySummary(
    operatorId: string
  ): Promise<{ total: number; byType: Record<string, number> }> {
    const result = await query(
      `SELECT event_type, COUNT(*)::int AS cnt
       FROM audit_log
       WHERE operator_id = $1 AND created_at >= date_trunc('day', now())
       GROUP BY event_type`,
      [operatorId]
    );
    const byType: Record<string, number> = {};
    let total = 0;
    for (const row of result.rows as { event_type: string; cnt: number }[]) {
      byType[row.event_type] = row.cnt;
      total += row.cnt;
    }
    return { total, byType };
  }
}
