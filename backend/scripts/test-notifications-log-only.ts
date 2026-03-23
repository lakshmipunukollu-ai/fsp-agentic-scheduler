/**
 * Verifies NOTIFICATIONS_LOG_ONLY — prints SMS/email to stdout without Twilio/SMTP.
 *
 *   cd backend && npx ts-node scripts/test-notifications-log-only.ts
 *
 * Loads .env from repo root; uses first operator from DB for audit rows (run `make seed` if empty).
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  process.env.NOTIFICATIONS_LOG_ONLY = 'true';

  const { query } = await import('../src/db/connection');
  const op = await query(`SELECT id FROM operators LIMIT 1`);
  if (op.rows.length === 0) {
    console.error('No operator in DB — run: make seed (or npm run seed)');
    process.exit(1);
  }
  const operatorId = (op.rows[0] as { id: string }).id;

  const sug = await query(`SELECT id FROM suggestions WHERE operator_id = $1 LIMIT 1`, [operatorId]);
  if (sug.rows.length === 0) {
    console.error('No suggestions in DB — run: make seed');
    process.exit(1);
  }
  const suggestionId = (sug.rows[0] as { id: string }).id;

  const { NotificationService } = await import('../src/services/notificationService');

  console.log('--- sendApprovalSMS ---');
  await NotificationService.sendApprovalSMS({
    operatorId,
    suggestionId,
    studentName: 'Demo Student',
    studentPhone: '+15551234567',
    lessonType: 'Dual',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    instructorName: 'Jane CFI',
    aircraftTail: 'N12345',
  });

  console.log('\n--- sendApprovalEmail ---');
  await NotificationService.sendApprovalEmail({
    operatorId,
    suggestionId,
    studentName: 'Demo Student',
    studentEmail: 'demo@example.com',
    lessonType: 'Dual',
    startTime: new Date(Date.now() + 86400000).toISOString(),
    instructorName: 'Jane CFI',
    aircraftTail: 'N12345',
  });

  console.log('\n--- sendStaffStudentScheduleSubmittedSMS ---');
  await NotificationService.sendStaffStudentScheduleSubmittedSMS(operatorId, {
    requestId: '00000000-0000-0000-0000-000000000003',
    studentName: 'Demo Student',
    lessonCount: 2,
    staffRows: [
      { id: 'a1', name: 'Admin', phone: '+15559876543' },
      { id: 'a2', name: 'Dispatcher', phone: null },
    ],
  });

  console.log('\nDone. [NOTIFICATIONS_LOG_ONLY] blocks above = log-only mode works.');
  const { closePool } = await import('../src/db/connection');
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
