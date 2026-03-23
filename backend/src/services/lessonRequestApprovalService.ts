import { validate as uuidValidate } from 'uuid';
import { query } from '../db/connection';
import { AuditService } from './auditService';
import { NotificationService } from './notificationService';
import { AppError } from '../middleware/errorHandler';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function summarizeSlotsForAudit(aiSchedule: unknown[]): Array<{
  date: string;
  startTime: string;
  endTime: string;
  lessonType?: string;
}> {
  if (!Array.isArray(aiSchedule)) return [];
  return aiSchedule.map((raw) => {
    const s = raw as Record<string, unknown>;
    return {
      date: String(s?.date ?? ''),
      startTime: String(s?.startTime ?? ''),
      endTime: String(s?.endTime ?? ''),
      lessonType: s?.lessonType != null ? String(s.lessonType) : undefined,
    };
  });
}

/**
 * Staff approves a student's AI schedule request: inserts confirmed scheduled_lessons,
 * marks lesson_requests approved, syncs related suggestions.
 * Idempotent if request is already approved (no duplicate lessons/hours).
 */
export async function approveLessonRequestByStaff(
  operatorId: string,
  requestId: string,
  reviewerId: string
): Promise<{ lessonsCreated: number; alreadyApproved: boolean }> {
  if (!uuidValidate(requestId)) {
    throw new AppError('Invalid request id', 400);
  }

  const requestResult = await query(
    `SELECT lr.*, u.name as student_name FROM lesson_requests lr JOIN users u ON u.id = lr.user_id WHERE lr.id = $1 AND lr.operator_id = $2`,
    [requestId, operatorId]
  );
  if (requestResult.rows.length === 0) {
    throw new AppError('Request not found', 404);
  }
  const lessonRequest = requestResult.rows[0] as {
    id: string;
    user_id: string;
    status: string;
    ai_schedule: unknown;
    student_name: string;
  };

  if (lessonRequest.status === 'approved') {
    await query(
      `UPDATE suggestions SET status = 'approved', reviewed_at = COALESCE(reviewed_at, NOW()), reviewed_by = COALESCE(reviewed_by, $1)
       WHERE operator_id = $2 AND payload->>'lessonRequestId' = $3 AND status = 'pending'`,
      [reviewerId, operatorId, requestId]
    );
    return { lessonsCreated: 0, alreadyApproved: true };
  }

  if (lessonRequest.status !== 'pending_approval') {
    throw new AppError(`Cannot approve lesson request with status: ${lessonRequest.status}`, 400);
  }

  const aiSchedule = lessonRequest.ai_schedule as Array<{
    date: string;
    startTime: string;
    endTime: string;
    lessonType: string;
    instructorName: string;
    aircraftTail: string;
    durationHours?: number;
  }>;

  if (!Array.isArray(aiSchedule) || aiSchedule.length === 0) {
    throw new AppError('Lesson request has no schedule slots', 400);
  }

  const createdLessons: unknown[] = [];
  for (const slot of aiSchedule) {
    const startTime = new Date(`${slot.date}T${slot.startTime}:00`);
    const endTime = new Date(`${slot.date}T${slot.endTime}:00`);
    const lessonResult = await query(
      `INSERT INTO scheduled_lessons (user_id, operator_id, lesson_request_id, lesson_type, instructor_name, aircraft_tail, start_time, end_time, status, duration_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', $9) RETURNING *`,
      [
        lessonRequest.user_id,
        operatorId,
        requestId,
        slot.lessonType,
        slot.instructorName,
        slot.aircraftTail,
        startTime.toISOString(),
        endTime.toISOString(),
        slot.durationHours ?? 2,
      ]
    );
    createdLessons.push(lessonResult.rows[0]);
  }

  await query(
    `UPDATE lesson_requests SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1 WHERE id = $2`,
    [reviewerId, requestId]
  );

  await query(
    `UPDATE suggestions SET status = 'approved', reviewed_at = NOW(), reviewed_by = $1
     WHERE operator_id = $2 AND payload->>'lessonRequestId' = $3`,
    [reviewerId, operatorId, requestId]
  );

  const totalHours = aiSchedule.reduce((sum, s) => sum + (Number(s.durationHours) || 2), 0);
  await query(`UPDATE student_profiles SET hours_scheduled = hours_scheduled + $1 WHERE user_id = $2`, [
    totalHours,
    lessonRequest.user_id,
  ]);

  await query(
    `INSERT INTO notifications (operator_id, user_id, type, title, body, payload) VALUES ($1, $2, 'schedule_approved', 'Schedule Approved! 🎉', $3, $4)`,
    [
      operatorId,
      lessonRequest.user_id,
      `Your schedule request has been approved! ${aiSchedule.length} lesson${aiSchedule.length !== 1 ? 's' : ''} (${totalHours}h) confirmed in your calendar.`,
      JSON.stringify({ lessonCount: aiSchedule.length, totalHours }),
    ]
  );

  await NotificationService.sendStudentTransactionalEmail({
    operatorId,
    userId: lessonRequest.user_id,
    studentName: lessonRequest.student_name,
    subject: 'Your schedule was approved',
    html: `<p>Hi ${escapeHtml(lessonRequest.student_name)},</p>
<p>Your schedule request was approved. <strong>${aiSchedule.length}</strong> lesson(s) (<strong>${totalHours}h</strong>) are confirmed in your calendar.</p>`,
    context: 'schedule_approved_by_staff',
  });


  await AuditService.log(operatorId, 'student_request_approved', `scheduler:${reviewerId}`, undefined, {
    requestId,
    studentName: lessonRequest.student_name,
    lessonsCreated: createdLessons.length,
    totalHours,
    lessonIds: (createdLessons as { id: string }[]).map((l) => l.id),
    slots: summarizeSlotsForAudit(aiSchedule),
  });

  return { lessonsCreated: createdLessons.length, alreadyApproved: false };
}
