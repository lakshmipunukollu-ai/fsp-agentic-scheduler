import { useState, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@skyhigh.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>PB</div>
        <h1 style={styles.title}>Agentic Scheduler</h1>
        <p style={styles.subtitle}>Pilotbase — Dispatcher Console</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={styles.input}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={styles.input}
              required
            />
          </div>
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div style={demoStyles.panel}>
          <div style={demoStyles.panelTitle}>Demo Accounts — Click to auto-fill</div>
          <div style={demoStyles.accountsGrid}>
            {[
              { role: 'Admin', email: 'admin@skyhigh.com', password: 'admin123', color: '#7c3aed', icon: '⚙', desc: 'Full dashboard + Students tab' },
              { role: 'Dispatcher', email: 'dispatcher@skyhigh.com', password: 'scheduler123', color: '#2563eb', icon: '📋', desc: 'Approval queue + agent' },
              { role: 'Student — PPL (37h)', email: 'emma@skyhigh.com', password: 'student123', color: '#059669', icon: '✈', desc: 'Private Pilot, 53% complete' },
              { role: 'Student — CPL (112h)', email: 'carlos@skyhigh.com', password: 'student123', color: '#d97706', icon: '🎓', desc: 'Commercial Pilot, 45% complete' },
            ].map(account => (
              <button
                key={account.email}
                onClick={() => { setEmail(account.email); setPassword(account.password); }}
                style={{ ...demoStyles.accountBtn, borderColor: account.color + '30' }}
              >
                <span style={{ ...demoStyles.accountIcon, background: account.color + '12', color: account.color }}>
                  {account.icon}
                </span>
                <div style={demoStyles.accountInfo}>
                  <div style={{ ...demoStyles.accountRole, color: account.color }}>{account.role}</div>
                  <div style={demoStyles.accountEmail}>{account.email}</div>
                  <div style={demoStyles.accountDesc}>{account.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const demoStyles: Record<string, React.CSSProperties> = {
  panel: { marginTop: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' },
  panelTitle: { fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '12px' },
  accountsGrid: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  accountBtn: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: '#fff', border: '1px solid', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' as const, width: '100%' },
  accountIcon: { width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 },
  accountInfo: { flex: 1 },
  accountRole: { fontSize: '13px', fontWeight: 700, marginBottom: '1px' },
  accountEmail: { fontSize: '11px', color: '#64748b' },
  accountDesc: { fontSize: '11px', color: '#94a3b8', marginTop: '1px' },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  },
  card: {
    background: '#ffffff',
    borderRadius: '12px',
    padding: '48px',
    width: '400px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    textAlign: 'center' as const,
  },
  logo: {
    display: 'inline-block',
    background: '#2563eb',
    color: '#fff',
    fontWeight: 800,
    fontSize: '24px',
    padding: '12px 20px',
    borderRadius: '8px',
    marginBottom: '16px',
    letterSpacing: '2px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 4px 0',
  },
  subtitle: {
    color: '#64748b',
    margin: '0 0 32px 0',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  field: {
    textAlign: 'left' as const,
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
  button: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
  },
  error: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '10px',
    borderRadius: '8px',
    fontSize: '13px',
    border: '1px solid #fecaca',
  },
};
