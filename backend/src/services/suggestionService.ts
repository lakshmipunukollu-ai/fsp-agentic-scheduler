import { query } from '../db/connection';
import { Suggestion, SuggestionPayload, SuggestionRationale, SuggestionType } from '../types';
import { AuditService } from './auditService';
import { AppError } from '../middleware/errorHandler';

export class SuggestionService {
  static async create(
    operatorId: string,
    type: SuggestionType,
    priority: number,
    payload: SuggestionPayload,
    rationale: SuggestionRationale,
    expirationHours: number = 24
  ): Promise<Suggestion> {
    const result = await query(
      `INSERT INTO suggestions (operator_id, type, priority, payload, rationale, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour' * $6)
       RETURNING *`,
      [operatorId, type, priority, JSON.stringify(payload), JSON.stringify(rationale), expirationHours]
    );

    const suggestion = result.rows[0];

    await AuditService.log(operatorId, 'suggestion_created', 'agent', suggestion.id, {
      type,
      confidence: rationale.confidence,
    });

    return suggestion;
  }

  static async getByOperator(
    operatorId: string,
    options: { status?: string; type?: string; page?: number; limit?: number } = {}
  ): Promise<{ data: Suggestion[]; total: number; page: number; limit: number }> {
    const { status, type, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE operator_id = $1';
    const params: unknown[] = [operatorId];

    if (status) {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    if (type) {
      whereClause += ` AND type = $${params.length + 1}`;
      params.push(type);
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM suggestions ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT * FROM suggestions ${whereClause}
       ORDER BY priority DESC, created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
    };
  }

  static async getById(operatorId: string, id: string): Promise<Suggestion> {
    const result = await query(
      'SELECT * FROM suggestions WHERE id = $1 AND operator_id = $2',
      [id, operatorId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Suggestion not found', 404);
    }

    return result.rows[0];
  }

  static async approve(operatorId: string, id: string, userId: string, notes?: string): Promise<Suggestion> {
    const suggestion = await this.getById(operatorId, id);

    if (suggestion.status !== 'pending') {
      throw new AppError(`Cannot approve suggestion with status: ${suggestion.status}`, 400);
    }

    const result = await query(
      `UPDATE suggestions SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1
       WHERE id = $2 AND operator_id = $3
       RETURNING *`,
      [userId, id, operatorId]
    );

    await AuditService.log(operatorId, 'suggestion_approved', `scheduler:${userId}`, id, { notes });

    return result.rows[0];
  }

  static async decline(operatorId: string, id: string, userId: string, reason?: string): Promise<Suggestion> {
    const suggestion = await this.getById(operatorId, id);

    if (suggestion.status !== 'pending') {
      throw new AppError(`Cannot decline suggestion with status: ${suggestion.status}`, 400);
    }

    const result = await query(
      `UPDATE suggestions SET status = 'declined', reviewed_at = NOW(), reviewed_by = $1
       WHERE id = $2 AND operator_id = $3
       RETURNING *`,
      [userId, id, operatorId]
    );

    await AuditService.log(operatorId, 'suggestion_declined', `scheduler:${userId}`, id, { reason });

    return result.rows[0];
  }

  static async bulkApprove(operatorId: string, ids: string[], userId: string): Promise<{ approved: number; failed: string[] }> {
    let approved = 0;
    const failed: string[] = [];

    for (const id of ids) {
      try {
        await this.approve(operatorId, id, userId);
        approved++;
      } catch {
        failed.push(id);
      }
    }

    return { approved, failed };
  }

  static async bulkDecline(operatorId: string, ids: string[], userId: string, reason?: string): Promise<{ declined: number; failed: string[] }> {
    let declined = 0;
    const failed: string[] = [];

    for (const id of ids) {
      try {
        await this.decline(operatorId, id, userId, reason);
        declined++;
      } catch {
        failed.push(id);
      }
    }

    return { declined, failed };
  }
}
