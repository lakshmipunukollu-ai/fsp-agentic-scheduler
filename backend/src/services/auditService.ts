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
}
