import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDashboardData } from '../context/DashboardDataContext';
import { api } from '../api/client';

function formatRelative(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default function AppContextBar() {
  const { user } = useAuth();
  const { lastAgentRun } = useDashboardData();
  const [school, setSchool] = useState<'part_141' | 'part_61' | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSchoolType()
      .then(d => {
        if (!cancelled) setSchool(d.school_type);
      })
      .catch(() => {
        if (!cancelled) setSchool(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const roleLabel = user?.role ? user.role.replace('_', ' ') : '—';
  const schoolLabel =
    school === 'part_141' ? 'Part 141' : school === 'part_61' ? 'Part 61' : '—';

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap' as const,
        alignItems: 'center',
        gap: '10px 20px',
        marginBottom: 18,
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--context-bar-bg, rgba(6, 182, 212, 0.06))',
        border: '1px solid var(--context-bar-border, rgba(6, 182, 212, 0.2))',
        fontSize: 12,
        color: 'var(--text-secondary, #475569)',
      }}
    >
      <span>
        <strong style={{ color: 'var(--text-primary, #0f172a)', fontWeight: 600 }}>Signed in</strong>{' '}
        {user?.name ?? '—'} ·{' '}
        <span style={{ textTransform: 'capitalize' as const }}>{roleLabel}</span>
      </span>
      <span style={{ opacity: 0.5 }}>|</span>
      <span>
        <strong style={{ color: 'var(--text-primary, #0f172a)', fontWeight: 600 }}>School</strong> {schoolLabel}
      </span>
      <span style={{ opacity: 0.5 }}>|</span>
      <span>
        <strong style={{ color: 'var(--text-primary, #0f172a)', fontWeight: 600 }}>Last agent run</strong>{' '}
        {lastAgentRun ? formatRelative(lastAgentRun) : '—'}
      </span>
    </div>
  );
}
