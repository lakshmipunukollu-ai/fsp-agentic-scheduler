import { useEffect, useState } from 'react';
import { api } from '../api/client';

/** Uses GET /api/students/notifications — returns rows for the logged-in user (student or staff). */
export default function InAppNotificationBell() {
  const [notifications, setNotifications] = useState<
    { id: string; title: string; body: string; read: boolean; created_at: string }[]
  >([]);
  const [open, setOpen] = useState(false);

  const load = () => {
    api.getStudentNotifications().then(d => setNotifications((d.notifications as typeof notifications) ?? [])).catch(() => {});
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div style={{ position: 'relative' as const }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative' as const, padding: '4px' }}
      >
        <span style={{ fontSize: '22px' }}>🔔</span>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute' as const,
              top: 0,
              right: 0,
              background: '#ef4444',
              color: '#fff',
              borderRadius: '50%',
              width: '16px',
              height: '16px',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute' as const,
            right: 0,
            top: '40px',
            width: 'min(360px, 92vw)',
            background: 'var(--bg-panel, #fff)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            zIndex: 200,
            overflow: 'hidden',
            border: '1px solid var(--border-subtle, #e2e8f0)',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
            In-app notifications
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center' as const, color: '#94a3b8', fontSize: '13px' }}>No notifications</div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                style={{ padding: '14px 16px', borderBottom: '1px solid #f8fafc', background: n.read ? 'transparent' : '#eff6ff', cursor: 'pointer' }}
                onClick={() => {
                  api.markNotificationRead(n.id).catch(() => {});
                  setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
                }}
                onKeyDown={e => e.key === 'Enter' && api.markNotificationRead(n.id).catch(() => {})}
              >
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>{n.title}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{n.body}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
