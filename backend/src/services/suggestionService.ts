import { validate as uuidValidate } from 'uuid';
import { query } from '../db/connection';
import { Suggestion, SuggestionPayload, SuggestionRationale, SuggestionType } from '../types';
import { AuditService } from './auditService';
import { AppError } from '../middleware/errorHandler';
import { broadcastToOperator } from './sseService';
import { NotificationService } from './notificationService';
import { approveLessonRequestByStaff } from './lessonRequestApprovalService';

export class SuggestionService {
  static async create(
    operatorId: string,
    type: SuggestionType,
    priority: number,
    payload: SuggestionPayload,
    rationale: SuggestionRationale,
    expirationHours: number = 24,
    candidatesTried: number = 0
  ): Promise<Suggestion> {
    // Deduplication: skip if a pending suggestion already exists for same student + same slot
    if (payload.studentId && payload.startTime) {
      const dupCheck = await query(
        `SELECT id FROM suggestions
         WHERE operator_id = $1
           AND status = 'pending'
           AND payload->>'studentId' = $2
           AND payload->>'startTime' = $3`,
        [operatorId, payload.studentId, payload.startTime]
      );
      if (dupCheck.rows.length > 0) {
        const existing = await query('SELECT * FROM suggestions WHERE id = $1', [dupCheck.rows[0].id]);
        return existing.rows[0];
      }
    }

    const result = await query(
      `INSERT INTO suggestions (operator_id, type, priority, payload, rationale, expires_at, candidates_tried)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour' * $6, $7)
       RETURNING *`,
      [operatorId, type, priority, JSON.stringify(payload), JSON.stringify(rationale), expirationHours, candidatesTried]
    );

    const suggestion = result.rows[0];

    await AuditService.log(operatorId, 'suggestion_created', 'agent', suggestion.id, {
      type,
      confidence: rationale.confidence,
    });

    // Detect conflicts with other pending suggestions for the same slot
    const conflictResult = await query(
      `SELECT id FROM suggestions
       WHERE operator_id = $1
         AND status = 'pending'
         AND id != $2
         AND payload->>'startTime' = $3
         AND payload->>'instructorId' = $4`,
      [operatorId, suggestion.id, payload.startTime, payload.instructorId || '']
    );

    if (conflictResult.rows.length > 0) {
      await query(
        `UPDATE suggestions SET rationale = jsonb_set(rationale, '{conflictsWith}', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify(conflictResult.rows.map((r: { id: string }) => r.id)), suggestion.id]
      );
      suggestion.rationale.conflictsWith = conflictResult.rows.map((r: { id: string }) => r.id);
    }

    // Broadcast to SSE clients for real-time queue update
    broadcastToOperator(operatorId, 'suggestion.created', suggestion);

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

    const p0 = suggestion.payload as SuggestionPayload & { lessonRequestId?: string };
    if (p0.lessonRequestId && uuidValidate(p0.lessonRequestId)) {
      await approveLessonRequestByStaff(operatorId, p0.lessonRequestId, userId);
      await AuditService.log(operatorId, 'suggestion_approved', `scheduler:${userId}`, id, { notes });
      const approved = await this.getById(operatorId, id);
      broadcastToOperator(operatorId, 'suggestion.approved', { id, status: 'approved' });
      return approved;
    }

    const result = await query(
      `UPDATE suggestions SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1
       WHERE id = $2 AND operator_id = $3
       RETURNING *`,
      [userId, id, operatorId]
    );

    await AuditService.log(operatorId, 'suggestion_approved', `scheduler:${userId}`, id, { notes });

    const approved = result.rows[0];
    const p = approved.payload as SuggestionPayload;

    let studentPhone: string | undefined;
    let studentEmail: string | undefined;
    let allowSms = true;
    let allowEmail = true;
    if (uuidValidate(p.studentId)) {
      const contact = await query(
        `SELECT u.phone, u.email, sp.notification_sms, sp.notification_email
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.id = $1 AND u.operator_id = $2`,
        [p.studentId, operatorId]
      );
      if (contact.rows.length > 0) {
        const row = contact.rows[0] as {
          phone: string | null;
          email: string;
          notification_sms: boolean | null;
          notification_email: boolean | null;
        };
        studentPhone = row.phone || undefined;
        studentEmail = row.email || undefined;
        if (row.notification_sms === false) allowSms = false;
        if (row.notification_email === false) allowEmail = false;
      }
    }

    if (allowSms && studentPhone) {
      NotificationService.sendApprovalSMS({
        operatorId,
        suggestionId: id,
        studentName: p.studentName,
        studentPhone,
        lessonType: p.lessonType || 'lesson',
        startTime: p.startTime ?? new Date().toISOString(),
        instructorName: p.instructorName,
        aircraftTail: p.aircraftTail,
      }).catch(err => console.error('[Notification] Failed to send approval SMS:', err));
    } else if (uuidValidate(p.studentId) && allowSms && !studentPhone) {
      console.log('[Notification] Approval SMS skipped — no phone on file for student (set users.phone E.164 to enable).');
    }

    if (allowEmail && studentEmail) {
      NotificationService.sendApprovalEmail({
        operatorId,
        suggestionId: id,
        studentName: p.studentName,
        studentEmail,
        lessonType: p.lessonType || 'lesson',
        startTime: p.startTime ?? new Date().toISOString(),
        instructorName: p.instructorName,
        aircraftTail: p.aircraftTail,
      }).catch(err => console.error('[Notification] Failed to send approval email:', err));
    }

    // Broadcast approval event for SSE clients
    broadcastToOperator(operatorId, 'suggestion.approved', { id, status: 'approved' });

    return approved;
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

    const declined = result.rows[0];
    const p = declined.payload as SuggestionPayload & { lessonRequestId?: string };

    // If tied to a student schedule request, mark it declined and notify the student
    if (p.lessonRequestId && uuidValidate(p.lessonRequestId)) {
      await query(
        `UPDATE lesson_requests SET status = 'declined', updated_at = NOW()
         WHERE id = $1 AND operator_id = $2 AND status = 'pending_approval'`,
        [p.lessonRequestId, operatorId]
      );
    }

    if (p.studentId && uuidValidate(p.studentId)) {
      const studentInfo = await query(
        `SELECT u.name FROM users u WHERE u.id = $1 AND u.operator_id = $2`,
        [p.studentId, operatorId]
      );
      const studentName = studentInfo.rows[0]?.name || p.studentName || 'Student';

      await NotificationService.sendStudentTransactionalEmail({
        operatorId,
        userId: p.studentId,
        studentName,
        subject: 'Schedule request declined',
        html: `<p>Hi ${studentName},</p>
<p>Your schedule request has been reviewed and was <strong>not approved</strong> at this time.</p>
${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
<p>Please contact your instructor or school admin to discuss rescheduling or to submit a new request.</p>`,
        context: 'schedule_request_declined',
      });


      // In-app notification
      await query(
        `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
         VALUES ($1, $2, 'schedule_request_declined', $3, $4, $5)`,
        [
          operatorId,
          p.studentId,
          'Schedule request declined',
          reason
            ? `Your schedule request was declined. Reason: ${reason}`
            : 'Your schedule request was declined. Please contact your school to discuss rescheduling.',
          JSON.stringify({ suggestionId: id, lessonRequestId: p.lessonRequestId ?? null, reason: reason ?? null }),
        ]
      );
    }

    // Broadcast decline event for SSE clients
    broadcastToOperator(operatorId, 'suggestion.declined', { id, status: 'declined' });

    return declined;
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
