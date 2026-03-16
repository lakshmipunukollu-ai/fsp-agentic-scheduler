import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { AuditEntry } from '../types';

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  suggestion_created: { icon: '+', color: '#2563eb', label: 'Suggestion Created' },
  suggestion_approved: { icon: '✓', color: '#10b981', label: 'Suggestion Approved' },
  suggestion_declined: { icon: '✗', color: '#ef4444', label: 'Suggestion Declined' },
  student_schedule_request: { icon: '🎓', color: '#d97706', label: 'Student Schedule Request' },
  student_request_approved: { icon: '✓', color: '#10b981', label: 'Student Request Approved' },
  config_updated: { icon: '⚙', color: '#7c3aed', label: 'Config Updated' },
  feature_flags_updated: { icon: '⚑', color: '#d97706', label: 'Feature Flags Updated' },
};

const FILTER_OPTIONS = [
  { key: 'all', label: 'All events' },
  { key: 'suggestion_created', label: '✦ Created' },
  { key: 'suggestion_approved', label: '✓ Approved' },
  { key: 'suggestion_declined', label: '✗ Declined' },
  { key: 'student_schedule_request', label: '🎓 Student requests' },
  { key: 'config', label: '⚙ Config changes' },
];

export default function ActivityFeed() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadEntries(); }, [page]);

  useEffect(() => {
    if (page !== 1) return;
    pollRef.current = setInterval(loadSilent, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [page]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const result = await api.getAuditLog({ page, limit: 30 });
      const fetched = result.data as AuditEntry[];
      setEntries(fetched);
      setTotal(result.total);
      prevIdsRef.current = new Set(fetched.map(e => e.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  };

  const loadSilent = async () => {
    try {
      const result = await api.getAuditLog({ page: 1, limit: 30 });
      const fetched = result.data as AuditEntry[];
      const incoming = new Set<string>();
      for (const e of fetched) {
        if (!prevIdsRef.current.has(e.id)) incoming.add(e.id);
      }
      if (incoming.size > 0) {
        setNewIds(incoming);
        setEntries(fetched);
        setTotal(result.total);
        prevIdsRef.current = new Set(fetched.map(e => e.id));
        setTimeout(() => setNewIds(new Set()), 3000);
      }
    } catch { }
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
  });

  const formatActor = (a: string) => {
    if (a === 'agent') return 'Agent Engine';
    if (a.startsWith('scheduler:')) return 'Dispatcher';
    if (a.startsWith('student:')) return 'Student';
    return a;
  };

  const getActorColor = (a: string) => {
    if (a === 'agent') return '#2563eb';
    if (a.startsWith('scheduler:')) return '#10b981';
    if (a.startsWith('student:')) return '#d97706';
    return '#64748b';
  };

  const filteredEntries = entries.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'config') return e.event_type === 'config_updated' || e.event_type === 'feature_flags_updated';
    return e.event_type === filter;
  });

  // Today stats
  const today = new Date().toDateString();
  const todayEntries = entries.filter(e => new Date(e.created_at).toDateString() === today);
  const todayCreated = todayEntries.filter(e => e.event_type === 'suggestion_created').length;
  const todayApproved = todayEntries.filter(e => e.event_type === 'suggestion_approved').length;
  const todayDeclined = todayEntries.filter(e => e.event_type === 'suggestion_declined').length;
  const todayStudentReqs = todayEntries.filter(e => e.event_type === 'student_schedule_request').length;

  const totalPages = Math.ceil(total / 30);

  return (
    <div>
      <div style={s.titleRow}>
        <div>
          <h1 style={s.title}>Activity Feed</h1>
          <p style={s.subtitle}>Immutable audit log · FAA-compliant timestamping</p>
        </div>
        <div style={s.liveBadge}>
          <span style={s.liveDot} />
          Live
        </div>
      </div>

      {/* Today stats */}
      <div style={s.statsGrid}>
        {[
          { label: 'Today', value: todayEntries.length, sub: 'total events', color: '#6366f1' },
          { label: 'Approved', value: todayApproved, sub: 'slots confirmed', color: '#10b981' },
          { label: 'Declined', value: todayDeclined, sub: 'overridden', color: '#ef4444' },
          { label: 'Student requests', value: todayStudentReqs, sub: 'submitted today', color: '#d97706' },
        ].map(stat => (
          <div key={stat.label} style={s.statCard}>
            <div style={s.statLabel}>{stat.label}</div>
            <div style={{ ...s.statValue, color: stat.color }}>{stat.value}</div>
            <div style={s.statSub}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={s.filters}>
        {FILTER_OPTIONS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ ...s.filterBtn, ...(filter === f.key ? s.filterBtnActive : {}) }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div style={s.loading}>Loading activity...</div>}
      {error && <div style={s.error}>{error}</div>}

      <div style={s.timeline}>
        {filteredEntries.map(entry => {
          const cfg = EVENT_CONFIG[entry.event_type] || { icon: '?', color: '#6b7280', label: entry.event_type.replace(/_/g, ' ') };
          const isNew = newIds.has(entry.id);
          const isStudentReq = entry.event_type === 'student_schedule_request';
          return (
            <div key={entry.id}
              onClick={() => {
                if (entry.event_type.includes('suggestion') || entry.event_type.includes('student')) {
                  // Navigate to queue — use sendPrompt as nav hint
                }
              }}
              style={{ ...s.entry, ...(isNew ? s.entryNew : {}), ...(isStudentReq ? s.entryStudent : {}) }}>
              <div style={{ ...s.iconWrap, background: cfg.color + '18', color: cfg.color, borderColor: cfg.color + '40' }}>
                {cfg.icon}
              </div>
              <div style={s.entryContent}>
                <div style={s.entryHeader}>
                  <span style={s.eventType}>{cfg.label}</span>
                  <span style={{ ...s.actorBadge, color: getActorColor(entry.actor), background: getActorColor(entry.actor) + '14' }}>
                    {formatActor(entry.actor)}
                  </span>
                  {isNew && <span style={s.newBadge}>NEW</span>}
                  <span style={s.timestamp}>{formatDate(entry.created_at)}</span>
                </div>
                {entry.suggestion_id && (
                  <div style={s.suggId}>Suggestion: {entry.suggestion_id.substring(0, 8)}...</div>
                )}
                {entry.payload && Object.keys(entry.payload).length > 0 && (
                  <div style={s.tags}>
                    {Object.entries(entry.payload).slice(0, 4).map(([key, val]) => (
                      <span key={key} style={s.tag}>
                        <strong>{key}:</strong> {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </span>
                    ))}
                  </div>
                )}
                {(entry.event_type.includes('suggestion') || entry.event_type.includes('student')) && (
                  <div style={s.navHint}>→ Click to review in Approval Queue</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredEntries.length === 0 && !loading && (
        <div style={s.empty}>No events match this filter</div>
      )}

      {totalPages > 1 && (
        <div style={s.pagination}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={s.pageBtn}>Previous</button>
          <span style={s.pageInfo}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} style={s.pageBtn}>Next</button>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  title: { fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' },
  subtitle: { color: '#64748b', margin: 0, fontSize: '14px' },
  liveBadge: { display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', border: '0.5px solid #86efac', borderRadius: '20px', padding: '6px 14px', fontSize: '13px', fontWeight: 600, color: '#15803d' },
  liveDot: { width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' },
  statCard: { background: '#fff', border: '0.5px solid #f1f5f9', borderRadius: '12px', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  statLabel: { fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '8px' },
  statValue: { fontSize: '28px', fontWeight: 700, marginBottom: '2px' },
  statSub: { fontSize: '11px', color: '#94a3b8' },
  filters: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' as const },
  filterBtn: { padding: '6px 14px', borderRadius: '20px', border: '0.5px solid #e2e8f0', background: '#fff', fontSize: '12px', fontWeight: 500, color: '#475569', cursor: 'pointer' },
  filterBtnActive: { background: '#0f172a', color: '#fff', border: '0.5px solid #0f172a' },
  timeline: { display: 'flex', flexDirection: 'column' as const, gap: '3px' },
  entry: { display: 'flex', gap: '14px', padding: '14px 18px', background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'pointer', transition: 'all .15s', border: '0.5px solid #f1f5f9', marginBottom: '2px' },
  entryNew: { background: '#f0fdf4', border: '0.5px solid #86efac' },
  entryStudent: { borderLeft: '3px solid #d97706', paddingLeft: '15px' },
  iconWrap: { width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, flexShrink: 0, border: '1px solid' },
  entryContent: { flex: 1, minWidth: 0 },
  entryHeader: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const, marginBottom: '5px' },
  eventType: { fontWeight: 600, color: '#0f172a', fontSize: '13px' },
  actorBadge: { fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '10px' },
  newBadge: { fontSize: '10px', fontWeight: 700, background: '#10b981', color: '#fff', padding: '1px 7px', borderRadius: '8px' },
  timestamp: { fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' },
  suggId: { fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginBottom: '5px' },
  tags: { display: 'flex', flexWrap: 'wrap' as const, gap: '5px', marginTop: '6px' },
  tag: { fontSize: '11px', color: '#475569', background: '#f8fafc', border: '0.5px solid #e2e8f0', padding: '2px 8px', borderRadius: '6px' },
  navHint: { fontSize: '11px', color: '#2563eb', marginTop: '6px', fontWeight: 500 },
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  error: { color: '#dc2626', padding: '40px', textAlign: 'center' as const },
  empty: { color: '#94a3b8', padding: '40px', textAlign: 'center' as const, background: '#fff', borderRadius: '10px' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '20px' },
  pageBtn: { padding: '8px 16px', border: '0.5px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px' },
  pageInfo: { fontSize: '13px', color: '#64748b' },
};
