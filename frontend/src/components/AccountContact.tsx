import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Lets any signed-in user set email (login + notification recipient) and phone (SMS).
 */
export default function AccountContact() {
  const { syncUserFromServer } = useAuth();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getMyContact()
      .then((c) => {
        if (cancelled) return;
        setEmail(c.email);
        setPhone(c.phone ?? '');
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setErr('');
    setSaving(true);
    try {
      const res = await api.patchMyContact({
        email: email.trim().toLowerCase(),
        phone: phone.trim() === '' ? null : phone.trim(),
      });
      syncUserFromServer({ email: res.email, phone: res.phone });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Contact &amp; login email</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14, lineHeight: 1.45 }}>
        We send lesson emails to your email and texts to your mobile when your school uses those channels. Changing email also changes how you sign in.
      </div>
      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading...</div>
      ) : (
        <>
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box' as const,
              }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Mobile (optional)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              autoComplete="tel"
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: 14,
                boxSizing: 'border-box' as const,
              }}
            />
          </label>
          {err && (
            <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#b91c1c' }}>
              {err}
            </div>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#0d9488',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.75 : 1,
            }}
          >
            {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save contact info'}
          </button>
        </>
      )}
    </div>
  );
}
