/**
 * Send one SMS to verify Twilio credentials (same env vars as production).
 *
 * Usage:
 *   cd backend && npm run test:sms -- +15551234567
 *   TEST_SMS_TO=+15551234567 npm run test:sms
 *
 * Requires in .env (repo root or backend): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 * Trial accounts: the destination must be a verified number in Twilio Console.
 */
import path from 'path';
import dotenv from 'dotenv';
import twilio from 'twilio';

const rootEnv = path.resolve(__dirname, '../../.env');
const backendEnv = path.resolve(__dirname, '../.env');
dotenv.config({ path: rootEnv });
dotenv.config({ path: backendEnv });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;
const toArg = process.argv[2]?.trim();
const toEnv = process.env.TEST_SMS_TO?.trim();

/** Prefer E.164 (+country…). US: 10 digits or 11 starting with 1 → +1… */
function normalizeToE164(raw: string): string {
  const s = raw.replace(/\s/g, '');
  if (s.startsWith('+')) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

const toNumber = normalizeToE164(toArg || toEnv || '');

async function main() {
  if (!accountSid || !authToken || !fromNumber) {
    console.error(
      'Missing Twilio env vars. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in .env (repo root or backend/).'
    );
    process.exit(1);
  }

  if (!toNumber) {
    console.error(
      'Usage: npm run test:sms -- +15551234567\n   or: TEST_SMS_TO=+15551234567 npm run test:sms'
    );
    process.exit(1);
  }

  if (fromNumber === toNumber) {
    console.error(
      "Twilio rejects when From and To are the same. Use a different destination number (e.g. your verified cell)."
    );
    process.exit(1);
  }

  const client = twilio(accountSid, authToken);
  const body =
    process.env.TEST_SMS_BODY ||
    'Pilotbase scheduler: Twilio test OK. Reply STOP to opt out.';

  console.log(`Sending from ${fromNumber} to ${toNumber}...`);

  try {
    const msg = await client.messages.create({
      body,
      from: fromNumber,
      to: toNumber,
    });
    console.log(`API accepted. Message SID: ${msg.sid}`);
    console.log(`Initial status: ${msg.status} (often queued — checking delivery…)\n`);

    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const updated = await client.messages(msg.sid).fetch();
      const line = `  [${i + 1}] status=${updated.status}`;
      const extra =
        updated.errorCode != null
          ? ` errorCode=${updated.errorCode} ${updated.errorMessage || ''}`
          : '';
      console.log(line + extra);
      if (['delivered', 'undelivered', 'failed', 'canceled'].includes(updated.status)) {
        if (updated.status !== 'delivered') {
          console.error(
            '\nMessage did not deliver. Check Twilio Console → Monitor → Logs → Messaging for this SID.'
          );
          if (updated.errorCode === 21610 || /unverified/i.test(String(updated.errorMessage))) {
            console.error(
              'Trial account: add this destination under Phone Numbers → Verified Caller IDs.'
            );
          }
          process.exit(1);
        }
        console.log('\nDelivered — check your phone (and spam/blocked lists if still empty).');
        break;
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const any = err as { code?: number; moreInfo?: string };
    console.error('Twilio error:', errMsg);
    if (any.code) console.error('Twilio code:', any.code);
    if (any.moreInfo) console.error('More info:', any.moreInfo);
    if (/unverified|trial|not verified|21610/i.test(errMsg)) {
      console.error(
        '\nTip: On a Twilio trial, add the destination number under Phone Numbers → Manage → Verified Caller IDs.'
      );
    }
    process.exit(1);
  }
}

main();
