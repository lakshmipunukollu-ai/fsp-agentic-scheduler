/**
 * Send one email to verify SMTP (same env vars as NotificationService).
 *
 * Real inbox (Gmail, etc.):
 *   cd backend && npm run test:email -- you@example.com
 *
 * Zero-config demo (Ethereal fake inbox — no .env SMTP):
 *   npm run test:email:demo
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const rootEnv = path.resolve(__dirname, '../../.env');
const backendEnv = path.resolve(__dirname, '../.env');
const cwdEnv = path.resolve(process.cwd(), '.env');

/** Later files override earlier for duplicate keys. */
dotenv.config({ path: cwdEnv });
dotenv.config({ path: rootEnv });
dotenv.config({ path: backendEnv });

const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS?.trim();
const SMTP_FROM = (process.env.SMTP_FROM || 'noreply@flightschool.com').trim();

const cliArgs = process.argv.slice(2);
const demo = cliArgs.includes('--demo');
const toArg = cliArgs.find((a) => !a.startsWith('--'))?.trim();
const toEnv = process.env.TEST_EMAIL_TO?.trim();
const to = toArg || toEnv || '';

function smtpEnvHelp(): void {
  const paths = [
    { label: 'current directory', file: cwdEnv },
    { label: 'repo root', file: rootEnv },
    { label: 'backend/', file: backendEnv },
  ];
  console.error('Missing SMTP_HOST, SMTP_USER, or SMTP_PASS.\n');
  let anyEnvFile = false;
  for (const { label, file } of paths) {
    const exists = fs.existsSync(file);
    if (exists) anyEnvFile = true;
    console.error(`  ${exists ? '✓' : '✗'} ${label}: ${file}${exists ? '' : ' (file not found)'}`);
  }
  if (anyEnvFile) {
    console.error('\nAdd these to .env (or use the demo command below):\n');
  } else {
    console.error(`
Create ".env" from ".env.example", then add:
`);
  }
  console.error(`  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=you@gmail.com
  SMTP_PASS=your-app-password
  SMTP_FROM=you@gmail.com

No Gmail? Try a fake inbox (no SMTP vars):
  npm run test:email:demo
`);
}

async function runDemo(): Promise<void> {
  const nodemailer = (await import('nodemailer')).default;
  console.log('Demo mode — Ethereal fake inbox (no SMTP_* in .env).\n');
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  const info = await transporter.sendMail({
    from: `"Pilotbase test" <${testAccount.user}>`,
    to: testAccount.user,
    subject: 'Pilotbase scheduler: demo email',
    html:
      '<p>If you see this in the preview, nodemailer + HTML email works.</p><p>For a real inbox, set SMTP_* in <code>.env</code> and run <code>npm run test:email -- your@email.com</code>.</p>',
  });
  const preview = nodemailer.getTestMessageUrl(info);
  console.log('Preview URL (open in browser):');
  console.log(preview);
}

async function main() {
  if (demo) {
    try {
      await runDemo();
    } catch (err: unknown) {
      console.error('Demo error:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    smtpEnvHelp();
    process.exit(1);
  }
  if (!to) {
    console.error(
      'Usage: npm run test:email -- you@example.com\n   or: TEST_EMAIL_TO=you@example.com npm run test:email\n   or: npm run test:email:demo   (no Gmail / .env SMTP)'
    );
    process.exit(1);
  }

  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const subject = 'Pilotbase scheduler: SMTP test';
  const html =
    '<p>This is a test message from <code>npm run test:email</code>.</p><p>If you see this, SMTP is configured correctly.</p>';

  console.log(`Sending from ${SMTP_FROM} to ${to} via ${SMTP_HOST}:${SMTP_PORT}...`);

  try {
    const info = await transporter.sendMail({ from: SMTP_FROM, to, subject, html });
    console.log('Sent. Message id:', info.messageId);
    console.log('Check the inbox (and spam) for:', to);
  } catch (err: unknown) {
    console.error('SMTP error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
