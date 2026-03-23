import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { AuditEntry } from '../types';

/** Distinct badge per event — never a vague "?" (Pilotbase-style clarity, not legacy grid UI). */
type EventVisual = { abbr: string; label: string; accent: string; surface: string };

const EVENT_MAP: Record<string, EventVisual> = {
  suggestion_created: { abbr: 'CR', label: 'Suggestion created', accent: '#06b6d4', surface: 'rgba(6, 182, 212, 0.12)' },
  suggestion_approved: { abbr: 'OK', label: 'Suggestion approved', accent: '#10b981', surface: 'rgba(16, 185, 129, 0.12)' },
  suggestion_declined: { abbr: 'NO', label: 'Suggestion declined', accent: '#f97316', surface: 'rgba(249, 115, 22, 0.12)' },
  notification_sent: { abbr: 'TX', label: 'Notification sent', accent: '#a855f7', surface: 'rgba(168, 85, 247, 0.12)' },
  student_schedule_request: { abbr: 'RQ', label: 'Student schedule request', accent: '#ea580c', surface: 'rgba(234, 88, 12, 0.1)' },
  student_schedule_submitted: { abbr: 'SB', label: 'Student finalized schedule', accent: '#2563eb', surface: 'rgba(37, 99, 235, 0.12)' },
  student_request_approved: { abbr: 'RQ', label: 'Student request approved', accent: '#059669', surface: 'rgba(5, 150, 105, 0.12)' },
  config_updated: { abbr: 'CF', label: 'Config updated', accent: '#6366f1', surface: 'rgba(99, 102, 241, 0.12)' },
  feature_flags_updated: { abbr: 'FF', label: 'Feature flags updated', accent: '#d97706', surface: 'rgba(217, 119, 6, 0.12)' },
  agent_run: { abbr: 'AR', label: 'Agent run', accent: '#06b6d4', surface: 'rgba(6, 182, 212, 0.15)' },
  cancellation_simulated: { abbr: 'SM', label: 'Cancellation simulated', accent: '#f43f5e', surface: 'rgba(244, 63, 94, 0.1)' },
  student_lesson_cancelled: { abbr: 'CX', label: 'Student cancelled lesson', accent: '#f43f5e', surface: 'rgba(244, 63, 94, 0.12)' },
  student_schedule_draft_updated: { abbr: 'ED', label: 'Student edited schedule draft', accent: '#f59e0b', surface: 'rgba(245, 158, 11, 0.12)' },
  student_notification_prefs_updated: { abbr: 'NP', label: 'Student notification prefs', accent: '#6366f1', surface: 'rgba(99, 102, 241, 0.12)' },
  at_risk_nudge_created: { abbr: 'NU', label: 'At-risk nudge created', accent: '#eab308', surface: 'rgba(234, 179, 8, 0.12)' },
};

const STUDENT_PORTAL_EVENT_TYPES = new Set([
  'student_schedule_request',
  'student_schedule_submitted',
  'student_schedule_draft_updated',
  'student_request_approved',
  'student_lesson_cancelled',
  'student_notification_prefs_updated',
]);

function humanizeEventType(eventType: string): string {
  return eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fallbackVisual(eventType: string): EventVisual {
  const parts = eventType.split('_').filter(Boolean);
  let abbr = 'EV';
  if (parts.length >= 2) {
    abbr = (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
  } else if (parts.length === 1 && parts[0].length >= 2) {
    abbr = parts[0].slice(0, 2).toUpperCase();
  }
  return {
    abbr,
    label: humanizeEventType(eventType),
    accent: '#64748b',
    surface: 'rgba(100, 116, 139, 0.12)',
  };
}

function getEventVisual(eventType: string): EventVisual {
  return EVENT_MAP[eventType] ?? fallbackVisual(eventType);
}

function EventBadge({ visual }: { visual: EventVisual }) {
  return (
    <div
      title={visual.label}
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        flexShrink: 0,
        background: visual.surface,
        border: `2px solid ${visual.accent}`,
        color: visual.accent,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.04em',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      {visual.abbr}
    </div>
  );
}

const FILTERS = [
  { key: 'all', label: 'All events' },
  { key: 'suggestion_created', label: 'Created' },
  { key: 'suggestion_approved', label: 'Approved' },
  { key: 'suggestion_declined', label: 'Declined' },
  { key: 'agent_run', label: 'Agent runs' },
  { key: 'cancellation_simulated', label: 'Simulations' },
  { key: 'notification_sent', label: 'Notifications' },
  { key: 'student_schedule_request', label: 'Student requests' },
  { key: 'student_portal', label: 'Student portal (all)' },
  { key: 'config', label: 'Config' },
] as const;

const FILTER_KEYS: Set<string> = new Set(FILTERS.map(f => f.key));

export default function ActivityFeed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState(() =>
    initialFilter && FILTER_KEYS.has(initialFilter) ? initialFilter : 'all'
  );
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [todaySummary, setTodaySummary] = useState<{ total: number; byType: Record<string, number> } | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadEntries(); }, [page]);
  useEffect(() => {
    const f = searchParams.get('filter');
    if (f && FILTER_KEYS.has(f)) setFilter(f);
  }, [searchParams]);
  useEffect(() => {
    if (page !== 1) return;
    pollRef.current = setInterval(loadSilent, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [page]);

  const setFilterAndUrl = (key: string) => {
    setFilter(key);
    setPage(1);
    setSearchParams(prev => {
      const n = new URLSearchParams(prev);
      if (key === 'all') n.delete('filter');
      else n.set('filter', key);
      return n;
    }, { replace: true });
  };

  const loadEntries = async () => {
    setLoading(true);
    try {
      const [result, summary] = await Promise.all([
        api.getAuditLog({ page, limit: 30 }),
        api.getAuditTodaySummary(),
      ]);
      const fetched = result.data as AuditEntry[];
      setEntries(fetched); setTotal(result.total);
      setTodaySummary(summary);
      prevIdsRef.current = new Set(fetched.map(e => e.id));
    } finally { setLoading(false); }
  };

  const loadSilent = async () => {
    try {
      const [result, summary] = await Promise.all([
        api.getAuditLog({ page: 1, limit: 30 }),
        api.getAuditTodaySummary(),
      ]);
      const fetched = result.data as AuditEntry[];
      setTodaySummary(summary);
      const incoming = new Set<string>();
      for (const e of fetched) { if (!prevIdsRef.current.has(e.id)) incoming.add(e.id); }
      if (incoming.size > 0) {
        setNewIds(incoming); setEntries(fetched); setTotal(result.total);
        prevIdsRef.current = new Set(fetched.map(e => e.id));
        setTimeout(() => setNewIds(new Set()), 3000);
      }
    } catch { }
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const formatActor = (a: string) => a === 'agent' ? 'Agent' : a === 'system' ? 'System' : a.startsWith('scheduler:') ? 'Dispatcher' : a.startsWith('student:') ? 'Student' : a;
  const getActorColor = (a: string) =>
    a === 'agent' ? '#06b6d4' : a === 'system' ? '#a855f7' : a.startsWith('scheduler:') ? '#10b981' : a.startsWith('student:') ? '#ea580c' : '#64748b';

  const filtered = entries.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'config') return e.event_type === 'config_updated' || e.event_type === 'feature_flags_updated';
    if (filter === 'student_portal') return STUDENT_PORTAL_EVENT_TYPES.has(e.event_type);
    return e.event_type === filter;
  });

  const byType = todaySummary?.byType ?? {};
  const todayTotal = todaySummary?.total ?? 0;
  const approvedToday = byType.suggestion_approved ?? 0;
  const declinedToday = byType.suggestion_declined ?? 0;
  const studentReqToday = byType.student_schedule_request ?? 0;
  let studentPortalToday = 0;
  for (const t of STUDENT_PORTAL_EVENT_TYPES) studentPortalToday += byType[t] ?? 0;

  const totalPages = Math.ceil(total / 30);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: '#06b6d4', marginBottom: 6 }}>AUDIT LOG</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' as const }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary, #0a0a0a)', margin: '0 0 6px 0', letterSpacing: '-0.03em' }}>
              Activity
            </h1>
            <p style={{ color: 'var(--text-secondary, #525252)', margin: 0, fontSize: 14, lineHeight: 1.5, maxWidth: 520 }}>
              Immutable trail of agent and dispatcher actions — clear labels, no guesswork.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.35)', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#0891b2' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4', boxShadow: '0 0 0 2px rgba(6,182,212,0.35)' }} />
            Live
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Today', value: todayTotal, sub: 'All event types', filter: 'all' as const, accent: '#06b6d4', surface: 'rgba(6, 182, 212, 0.08)', border: 'rgba(6, 182, 212, 0.35)' },
          { label: 'Approved', value: approvedToday, sub: 'Suggestions approved', filter: 'suggestion_approved' as const, accent: '#10b981', surface: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.35)' },
          { label: 'Declined', value: declinedToday, sub: 'Suggestions declined', filter: 'suggestion_declined' as const, accent: '#f97316', surface: 'rgba(249, 115, 22, 0.08)', border: 'rgba(249, 115, 22, 0.3)' },
          { label: 'Student requests', value: studentReqToday, sub: 'AI schedule generated', filter: 'student_schedule_request' as const, accent: '#ea580c', surface: 'rgba(234, 88, 12, 0.08)', border: 'rgba(234, 88, 12, 0.3)' },
          { label: 'Student portal', value: studentPortalToday, sub: 'Drafts, submit, prefs, cancel…', filter: 'student_portal' as const, accent: '#c2410c', surface: 'rgba(194, 65, 12, 0.08)', border: 'rgba(194, 65, 12, 0.28)' },
        ].map(stat => (
          <button
            key={stat.label}
            type="button"
            onClick={() => setFilterAndUrl(stat.filter)}
            style={{
              background: stat.surface,
              border: `1px solid ${stat.border}`,
              borderRadius: 12,
              padding: '14px 16px',
              cursor: 'pointer',
              textAlign: 'left' as const,
              font: 'inherit',
              width: '100%',
              transition: 'transform 0.12s ease',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: stat.accent, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 6 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary, #0a0a0a)', marginBottom: 4 }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted, #737373)' }}>{stat.sub}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const }}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <button
              type="button"
              key={f.key}
              onClick={() => setFilterAndUrl(f.key)}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: active ? '1px solid #06b6d4' : '1px solid var(--border, #e5e5e5)',
                background: active ? 'rgba(6, 182, 212, 0.12)' : 'var(--bg-surface, #fff)',
                color: active ? '#0e7490' : 'var(--text-secondary, #525252)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div style={{
        background: 'var(--bg-surface, #fff)',
        borderRadius: 12,
        border: '1px solid var(--border, #e5e5e5)',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--pb-table-head, #0a0a0a)', color: '#fafafa' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Event</th>
              <th style={{ padding: '12px 16px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Actor</th>
              <th style={{ padding: '12px 16px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Details</th>
              <th style={{ padding: '12px 16px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} style={{ padding: '40px', textAlign: 'center' as const, color: '#737373' }}>Loading activity…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '40px', textAlign: 'center' as const, color: '#a3a3a3' }}>No events match this filter</td></tr>
            )}
            {filtered.map((entry, i) => {
              const visual = getEventVisual(entry.event_type);
              const isNew = newIds.has(entry.id);
              return (
                <tr
                  key={entry.id}
                  style={{
                    background: isNew ? 'rgba(6, 182, 212, 0.06)' : i % 2 === 0 ? 'var(--bg-surface, #fff)' : 'rgba(250, 250, 250, 0.9)',
                    borderLeft: entry.event_type === 'student_schedule_request' ? '3px solid #ea580c' : '3px solid transparent',
                  }}
                >
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border, #f0f0f0)', verticalAlign: 'middle' as const }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <EventBadge visual={visual} />
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary, #0a0a0a)', fontSize: 14, letterSpacing: '-0.02em' }}>{visual.label}</div>
                        {entry.suggestion_id && (
                          <div style={{ fontSize: 11, color: '#a3a3a3', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>
                            {entry.suggestion_id.substring(0, 8)}…
                          </div>
                        )}
                      </div>
                      {isNew && (
                        <span style={{ background: '#06b6d4', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, letterSpacing: '0.04em' }}>NEW</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border, #f0f0f0)', verticalAlign: 'middle' as const }}>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: getActorColor(entry.actor),
                      background: `${getActorColor(entry.actor)}18`,
                      padding: '4px 10px',
                      borderRadius: 999,
                    }}>
                      {formatActor(entry.actor)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border, #f0f0f0)', verticalAlign: 'middle' as const }}>
                    {entry.event_type === 'notification_sent' && entry.payload ? (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary, #404040)' }}>
                        <span style={{ fontWeight: 700 }}>
                          {(entry.payload as Record<string, unknown>).sent ? 'Sent' : 'Demo'} →
                        </span>{' '}
                        {String((entry.payload as Record<string, unknown>).recipient || '')}
                        {(entry.payload as Record<string, unknown>).phone != null && String((entry.payload as Record<string, unknown>).phone) !== '' ? (
                          <span style={{ color: '#a3a3a3' }}> · {String((entry.payload as Record<string, unknown>).phone)}</span>
                        ) : null}
                        {(entry.payload as Record<string, unknown>).message != null && String((entry.payload as Record<string, unknown>).message) !== '' ? (
                          <div style={{ color: '#7c3aed', fontStyle: 'italic', marginTop: 4, fontSize: 11 }}>
                            “{String((entry.payload as Record<string, unknown>).message)}”
                          </div>
                        ) : null}
                      </div>
                    ) : entry.payload && Object.keys(entry.payload).length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                        {Object.entries(entry.payload).slice(0, 4).map(([key, val]) => (
                          <span key={key} style={{ fontSize: 11, color: '#404040', background: '#f5f5f5', padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}>
                            <strong style={{ fontWeight: 700 }}>{key}</strong>{' '}
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border, #f0f0f0)', verticalAlign: 'middle' as const, fontSize: 12, color: '#737373', whiteSpace: 'nowrap' as const }}>
                    {formatDate(entry.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 }}>
          <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '8px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-surface, #fff)', cursor: 'pointer', fontSize: 13 }}>Previous</button>
          <span style={{ fontSize: 13, color: '#737373' }}>Page {page} of {totalPages}</span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} style={{ padding: '8px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, background: 'var(--bg-surface, #fff)', cursor: 'pointer', fontSize: 13 }}>Next</button>
        </div>
      )}
    </div>
  );
}
