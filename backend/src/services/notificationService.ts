import twilio from 'twilio';
import { Resend } from 'resend';
import { query } from '../db/connection';
import { AuditService } from './auditService';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
const TWILIO_ENABLED = !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);

// Resend (HTTP API — works on Railway; preferred over SMTP)
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const RESEND_FROM = (process.env.RESEND_FROM || process.env.SMTP_FROM || 'onboarding@resend.dev').trim();
const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// SMTP fallback via nodemailer (only used when RESEND_API_KEY is not set)
let nodemailer: typeof import('nodemailer') | null = null;
const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS?.trim();
const SMTP_FROM = (process.env.SMTP_FROM || 'noreply@flightschool.com').trim();
const SMTP_ENABLED = !resendClient && !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

if (SMTP_ENABLED) {
  try {
    nodemailer = require('nodemailer');
  } catch {
    console.warn('[Email] nodemailer not installed. Run: npm install nodemailer @types/nodemailer');
  }
}

let transporter: ReturnType<typeof import('nodemailer').createTransport> | null = null;
if (SMTP_ENABLED && nodemailer) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const EMAIL_ENABLED = !!(resendClient || transporter);

if (resendClient) {
  console.log('[Email] Resend configured — transactional email active.');
} else if (transporter) {
  console.log('[Email] SMTP configured — transactional email will send to users.email');
} else {
  console.log('[Email] No email provider configured (set RESEND_API_KEY or SMTP_HOST/USER/PASS).');
}

let twilioClient: ReturnType<typeof twilio> | null = null;
if (TWILIO_ENABLED) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID!, TWILIO_AUTH_TOKEN!);
}

/** When true, log SMS/email to the server console and skip Twilio/SMTP (local iteration without real sends). */
const NOTIFICATIONS_LOG_ONLY =
  process.env.NOTIFICATIONS_LOG_ONLY === 'true' || process.env.NOTIFICATIONS_LOG_ONLY === '1';

export interface NotificationPayload {
  operatorId: string;
  suggestionId: string;
  studentName: string;
  studentPhone?: string;
  lessonType: string;
  startTime: string;
  instructorName?: string;
  aircraftTail?: string;
}

export class NotificationService {
  static async sendApprovalSMS(payload: NotificationPayload): Promise<void> {
    const { operatorId, suggestionId, studentName, studentPhone, lessonType, startTime, instructorName } = payload;

    const formattedTime = new Date(startTime).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const message = `✈ Flight School: Your ${lessonType} lesson is confirmed for ${formattedTime}${instructorName ? ` with ${instructorName}` : ''}. See you then!`;

    const notificationLog = {
      channel: 'sms',
      recipient: studentName,
      phone: studentPhone || 'on file',
      message,
      sent: false,
      twilioEnabled: TWILIO_ENABLED,
    };

    if (NOTIFICATIONS_LOG_ONLY) {
      const toNumber = studentPhone || '(no phone — would need users.phone)';
      console.log(
        `\n[NOTIFICATIONS_LOG_ONLY] SMS (approval)\n  to: ${toNumber}\n  body: ${message}\n`
      );
      notificationLog.sent = false;
      (notificationLog as Record<string, unknown>).stub_reason = 'NOTIFICATIONS_LOG_ONLY=true — not sent';
    } else if (TWILIO_ENABLED && twilioClient) {
      const toNumber = studentPhone || TWILIO_FROM_NUMBER!;
      try {
        const result = await twilioClient.messages.create({
          body: message,
          from: TWILIO_FROM_NUMBER!,
          to: toNumber,
        });
        notificationLog.sent = true;
        console.log(`[Twilio] SMS sent to ${studentName} (${toNumber}): ${result.sid}`);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Twilio trial accounts can only message verified numbers; surface that clearly
        const isTrial = errMsg.toLowerCase().includes('unverified') || errMsg.toLowerCase().includes('trial');
        console.error(`[Twilio] SMS failed for ${studentName} (${isTrial ? 'trial account — unverified number' : 'error'}):`, errMsg);
        (notificationLog as Record<string, unknown>).error = isTrial
          ? 'Twilio trial mode: can only send to verified numbers. Add the student phone to Twilio verified callers, or upgrade to a paid Twilio account for production.'
          : errMsg;
        notificationLog.sent = false;
      }
    } else {
      console.log(`[Notification] STUB — Twilio not configured. Would SMS ${studentName}: "${message}"`);
      (notificationLog as Record<string, unknown>).stub_reason = 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER env vars not set. Notification was not sent — this is expected in demo/dev mode.';
    }

    await AuditService.log(operatorId, 'notification_sent', 'system', suggestionId, notificationLog as Record<string, unknown>);
  }

  static async sendApprovalEmail(payload: NotificationPayload & { studentEmail?: string }): Promise<void> {
    const { operatorId, suggestionId, studentName, studentEmail, lessonType, startTime, instructorName, aircraftTail } = payload;

    const formattedTime = new Date(startTime).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

    const subject = `✈ Lesson Confirmed: ${lessonType} on ${formattedTime}`;
    const html = `
      <h2>Your lesson is confirmed!</h2>
      <p>Hi ${studentName},</p>
      <p>Your <strong>${lessonType}</strong> lesson is confirmed for <strong>${formattedTime}</strong>.</p>
      ${instructorName ? `<p>Instructor: <strong>${instructorName}</strong></p>` : ''}
      ${aircraftTail ? `<p>Aircraft: <strong>${aircraftTail}</strong></p>` : ''}
      <p>See you at the field!</p>
    `;

    const emailLog: Record<string, unknown> = {
      channel: 'email',
      recipient: studentName,
      email: studentEmail || 'on file',
      subject,
      sent: false,
      emailEnabled: EMAIL_ENABLED,
    };

    if (NOTIFICATIONS_LOG_ONLY && studentEmail) {
      console.log(
        `\n[NOTIFICATIONS_LOG_ONLY] Email (approval)\n  to: ${studentEmail}\n  subject: ${subject}\n  html: ${html.replace(/\s+/g, ' ').trim().slice(0, 400)}…\n`
      );
      emailLog.sent = false;
      emailLog.stub_reason = 'NOTIFICATIONS_LOG_ONLY=true — not sent';
    } else if (resendClient && studentEmail) {
      try {
        await resendClient.emails.send({ from: RESEND_FROM, to: studentEmail, subject, html });
        emailLog.sent = true;
        console.log(`[Email] Sent (Resend) to ${studentName} <${studentEmail}>`);
      } catch (err: unknown) {
        emailLog.error = err instanceof Error ? err.message : String(err);
        console.error(`[Email] Resend failed for ${studentName}:`, emailLog.error);
      }
    } else if (transporter && studentEmail) {
      try {
        await transporter.sendMail({ from: SMTP_FROM, to: studentEmail, subject, html });
        emailLog.sent = true;
        console.log(`[Email] Sent (SMTP) to ${studentName} <${studentEmail}>`);
      } catch (err: unknown) {
        emailLog.error = err instanceof Error ? err.message : String(err);
        console.error(`[Email] SMTP failed for ${studentName}:`, emailLog.error);
      }
    } else {
      const reason = NOTIFICATIONS_LOG_ONLY && !studentEmail
        ? 'No student email — cannot log email body'
        : !EMAIL_ENABLED
        ? 'SMTP_HOST / SMTP_USER / SMTP_PASS env vars not set — email not sent (expected in demo/dev)'
        : !studentEmail
        ? 'No student email address available'
        : 'SMTP transporter not initialized';
      emailLog.stub_reason = reason;
      console.log(`[Email] STUB — ${reason}. Would email ${studentName}: "${subject}"`);
    }

    await AuditService.log(operatorId, 'notification_sent', 'system', suggestionId, emailLog);
  }

  /**
   * Immediate email for student portal actions (cancel, schedule draft, submit, approval).
   * Respects student_profiles.notification_email; uses NOTIFICATIONS_LOG_ONLY / SMTP same as other mail.
   */
  static async sendStudentTransactionalEmail(opts: {
    operatorId: string;
    userId: string;
    studentName: string;
    subject: string;
    html: string;
    context: string;
  }): Promise<void> {
    try {
      await NotificationService.sendStudentTransactionalEmailInner(opts);
    } catch (e: unknown) {
      console.error('[Email] sendStudentTransactionalEmail:', e instanceof Error ? e.message : e);
    }
  }

  private static async sendStudentTransactionalEmailInner(opts: {
    operatorId: string;
    userId: string;
    studentName: string;
    subject: string;
    html: string;
    context: string;
  }): Promise<void> {
    const { operatorId, userId, studentName, subject, html, context } = opts;
    const r = await query(
      `SELECT COALESCE(u.contact_email, u.email) AS email,
              COALESCE(sp.notification_email, true) AS notification_email
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    if (r.rows.length === 0) return;
    const row = r.rows[0] as { email: string | null; notification_email: boolean };
    if (row.notification_email === false) {
      console.log(`[Email] Skipped (${context}) — student turned off email in notification preferences`);
      return;
    }
    const studentEmail = row.email?.trim();
    if (!studentEmail) return;

    const emailLog: Record<string, unknown> = {
      channel: 'email',
      context,
      recipient: studentName,
      email: studentEmail,
      subject,
      sent: false,
    };

    if (NOTIFICATIONS_LOG_ONLY) {
      console.log(
        `\n[NOTIFICATIONS_LOG_ONLY] Email (${context})\n  to: ${studentEmail}\n  subject: ${subject}\n`
      );
      emailLog.stub_reason = 'NOTIFICATIONS_LOG_ONLY=true — not sent';
      await AuditService.log(operatorId, 'notification_sent', 'system', undefined, emailLog);
      return;
    }

    if (resendClient) {
      try {
        await resendClient.emails.send({ from: RESEND_FROM, to: studentEmail, subject, html });
        emailLog.sent = true;
        console.log(`[Email] (${context}) → ${studentEmail} [Resend]`);
      } catch (err: unknown) {
        emailLog.error = err instanceof Error ? err.message : String(err);
        console.error(`[Email] (${context}) Resend failed:`, emailLog.error);
      }
    } else if (transporter) {
      try {
        await transporter.sendMail({ from: SMTP_FROM, to: studentEmail, subject, html });
        emailLog.sent = true;
        console.log(`[Email] (${context}) → ${studentEmail} [SMTP]`);
      } catch (err: unknown) {
        emailLog.error = err instanceof Error ? err.message : String(err);
        console.error(`[Email] (${context}) SMTP failed:`, emailLog.error);
      }
    } else {
      emailLog.stub_reason = 'No email provider configured (set RESEND_API_KEY)';
      console.log(`[Email] STUB (${context}) — would send to ${studentEmail}: ${subject}`);
    }

    await AuditService.log(operatorId, 'notification_sent', 'system', undefined, emailLog);
  }

  static async sendBulkApprovalNotifications(
    operatorId: string,
    approvedSuggestions: Array<{
      id: string;
      payload: {
        studentName: string;
        studentEmail?: string;
        studentPhone?: string;
        lessonType?: string;
        startTime: string;
        instructorName?: string;
        aircraftTail?: string;
      };
    }>
  ): Promise<void> {
    for (const s of approvedSuggestions) {
      const base = {
        operatorId,
        suggestionId: s.id,
        studentName: s.payload.studentName,
        lessonType: s.payload.lessonType || 'lesson',
        startTime: s.payload.startTime,
        instructorName: s.payload.instructorName,
        aircraftTail: s.payload.aircraftTail,
      };
      await Promise.all([
        this.sendApprovalSMS({ ...base, studentPhone: s.payload.studentPhone }),
        this.sendApprovalEmail({ ...base, studentEmail: s.payload.studentEmail }),
      ]);
    }
  }

  /** SMS to admin + scheduler when a student submits their edited AI schedule for approval. */
  static async sendStaffStudentScheduleSubmittedSMS(
    operatorId: string,
    opts: {
      requestId: string;
      studentName: string;
      lessonCount: number;
      staffRows: { id: string; name: string; phone: string | null }[];
    }
  ): Promise<void> {
    const extraPhones =
      process.env.TWILIO_STAFF_NOTIFY_NUMBERS?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const message = `✈ Flight School: ${opts.studentName} submitted a proposed schedule (${opts.lessonCount} lesson${opts.lessonCount === 1 ? '' : 's'}). Review in Approval Queue.`;

    const seen = new Set<string>();
    const targets: { phone: string; label: string }[] = [];
    for (const row of opts.staffRows) {
      if (row.phone && !seen.has(row.phone)) {
        seen.add(row.phone);
        targets.push({ phone: row.phone, label: row.name });
      }
    }
    for (const p of extraPhones) {
      if (!seen.has(p)) {
        seen.add(p);
        targets.push({ phone: p, label: 'TWILIO_STAFF_NOTIFY_NUMBERS' });
      }
    }

    if (targets.length === 0) {
      console.log(
        `[Notification] No staff SMS targets — set users.phone for admin/scheduler and/or TWILIO_STAFF_NOTIFY_NUMBERS. Would send: "${message}"`
      );
      return;
    }

    if (NOTIFICATIONS_LOG_ONLY) {
      console.log(`\n[NOTIFICATIONS_LOG_ONLY] Staff SMS (schedule submitted)\n  message: ${message}`);
      for (const { phone, label } of targets) {
        console.log(`  to (${label}): ${phone}`);
        await AuditService.log(operatorId, 'notification_sent', 'system', undefined, {
          channel: 'sms',
          recipient: label,
          phone,
          message,
          sent: false,
          stub_reason: 'NOTIFICATIONS_LOG_ONLY=true',
          context: 'student_schedule_submitted',
          requestId: opts.requestId,
        });
      }
      return;
    }

    for (const { phone, label } of targets) {
      const notificationLog: Record<string, unknown> = {
        channel: 'sms',
        recipient: label,
        phone,
        message,
        sent: false,
        twilioEnabled: TWILIO_ENABLED,
        context: 'student_schedule_submitted',
        requestId: opts.requestId,
      };

      if (TWILIO_ENABLED && twilioClient) {
        try {
          const result = await twilioClient.messages.create({
            body: message,
            from: TWILIO_FROM_NUMBER!,
            to: phone,
          });
          notificationLog.sent = true;
          console.log(`[Twilio] Staff alert SMS (${label}) ${result.sid}`);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          notificationLog.error = errMsg;
          console.error(`[Twilio] Staff alert SMS failed for ${label}:`, errMsg);
        }
      } else {
        console.log(`[Notification] STUB — Twilio not configured. Would SMS ${label} (${phone}): "${message}"`);
        notificationLog.stub_reason =
          'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER env vars not set';
      }

      await AuditService.log(operatorId, 'notification_sent', 'system', undefined, notificationLog);
    }
  }

}
