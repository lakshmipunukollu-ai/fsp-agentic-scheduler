import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { STAFF_PATH, type StaffTabId } from '../constants/nav';
import type { UserRole } from '../types';

const NAV: { id: StaffTabId; label: string; keywords: string; roles?: UserRole[] }[] = [
  { id: 'dashboard', label: 'Dashboard', keywords: 'home overview stats' },
  { id: 'queue', label: 'Approval Queue', keywords: 'pending suggestions review' },
  { id: 'activity', label: 'Activity Feed', keywords: 'audit log history' },
  { id: 'students', label: 'Students', keywords: 'roster admin', roles: ['admin'] },
  { id: 'analysis', label: 'Analysis', keywords: 'charts revenue', roles: ['admin', 'scheduler'] },
  { id: 'config', label: 'Policy Config', keywords: 'settings rules', roles: ['admin'] },
  { id: 'account', label: 'Account', keywords: 'email phone contact profile login' },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const role = user?.role;
    const list = NAV.filter(n => !n.roles || (role && n.roles.includes(role)));
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      n =>
        n.label.toLowerCase().includes(query) ||
        n.keywords.includes(query) ||
        n.id.includes(query)
    );
  }, [q, user?.role]);

  useEffect(() => {
    if (!open) {
      setQ('');
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (id: StaffTabId) => {
    const path = STAFF_PATH[id];
    if (path) navigate(path);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        paddingLeft: 16,
        paddingRight: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: 'min(480px, 100%)',
          background: 'var(--bg-panel, #fff)',
          borderRadius: 12,
          boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
          border: '1px solid var(--border-subtle, #e2e8f0)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle, #e2e8f0)' }}>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Go to…"
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              fontSize: 15,
              background: 'transparent',
              color: 'var(--text-primary, #0f172a)',
            }}
          />
        </div>
        <div style={{ maxHeight: 'min(50vh, 360px)', overflowY: 'auto' }}>
          {items.length === 0 ? (
            <div style={{ padding: '20px 16px', color: '#94a3b8', fontSize: 13 }}>No matches</div>
          ) : (
            items.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 16px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-primary, #0f172a)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--bg-muted, #f1f5f9)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
        <div style={{ padding: '8px 14px', fontSize: 11, color: '#94a3b8', borderTop: '1px solid var(--border-subtle, #e2e8f0)' }}>
          Esc to close · ⌘K / Ctrl+K
        </div>
      </div>
    </div>
  );
}
