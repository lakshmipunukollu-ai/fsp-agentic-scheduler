import AccountContact from './AccountContact';

/** Staff: email & phone for notifications (admin + dispatcher). */
export default function Account() {
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 20px 48px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #0f172a)', margin: '0 0 8px' }}>Account</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted, #64748b)', marginBottom: 20, lineHeight: 1.5 }}>
        Your login email and optional mobile number. Used for SMS and email alerts from the scheduler.
      </p>
      <AccountContact />
    </div>
  );
}
