import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { AuditEntry } from '../types';

const EVENT_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  suggestion_created: { icon: '+', color: '#2563eb', bg: '#eff6ff', label: 'Suggestion Created' },
  suggestion_approved: { icon: '✓', color: '#15803d', bg: '#f0fdf4', label: 'Suggestion Approved' },
  suggestion_declined: { icon: '✗', color: '#dc2626', bg: '#fef2f2', label: 'Suggestion Declined' },
  student_schedule_request: { icon: '🎓', color: '#d97706', bg: '#fffbeb', label: 'Student Schedule Request' },
  student_request_approved: { icon: '✓', color: '#15803d', bg: '#f0fdf4', label: 'Student Request Approved' },
  config_updated: { icon: '⚙', color: '#7c3aed', bg: '#f5f3ff', label: 'Config Updated' },
  feature_flags_updated: { icon: '⚑', color: '#d97706', bg: '#fffbeb', label: 'Feature Flags Updated' },
};

const FILTERS = [
  { key: 'all', label: 'All events' },
  { key: 'suggestion_created', label: '+ Created' },
  { key: 'suggestion_approved', label: '✓ Approved' },
  { key: 'suggestion_declined', label: '✗ Declined' },
  { key: 'student_schedule_request', label: '🎓 Student requests' },
  { key: 'config', label: '⚙ Config changes' },
];

export default function ActivityFeed() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
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
      setEntries(fetched); setTotal(result.total);
      prevIdsRef.current = new Set(fetched.map(e => e.id));
    } finally { setLoading(false); }
  };

  const loadSilent = async () => {
    try {
      const result = await api.getAuditLog({ page: 1, limit: 30 });
      const fetched = result.data as AuditEntry[];
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
  const formatActor = (a: string) => a === 'agent' ? 'Agent Engine' : a.startsWith('scheduler:') ? 'Dispatcher' : a.startsWith('student:') ? 'Student' : a;
  const getActorColor = (a: string) => a === 'agent' ? '#2563eb' : a.startsWith('scheduler:') ? '#15803d' : a.startsWith('student:') ? '#d97706' : '#64748b';

  const filtered = entries.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'config') return e.event_type === 'config_updated' || e.event_type === 'feature_flags_updated';
    return e.event_type === filter;
  });

  const today = new Date().toDateString();
  const todayEntries = entries.filter(e => new Date(e.created_at).toDateString() === today);

  const totalPages = Math.ceil(total / 30);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>Activity Feed</h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: '13px' }}>Immutable audit log · FAA-compliant timestamping</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '20px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, color: '#15803d' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          Live
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Today', value: todayEntries.length, sub: 'total events', color: '#4338ca', bg: '#eef2ff', border: '#a5b4fc' },
          { label: 'Approved', value: todayEntries.filter(e => e.event_type === 'suggestion_approved').length, sub: 'slots confirmed', color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
          { label: 'Declined', value: todayEntries.filter(e => e.event_type === 'suggestion_declined').length, sub: 'overridden', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
          { label: 'Student requests', value: todayEntries.filter(e => e.event_type === 'student_schedule_request').length, sub: 'submitted today', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
        ].map(stat => (
          <div key={stat.label} style={{ background: stat.bg, border: `1px solid ${stat.border}`, borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px' }}>{stat.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: stat.color, marginBottom: '2px' }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' as const }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '6px 14px', borderRadius: '20px', border: '1px solid',
            borderColor: filter === f.key ? '#1e3a5f' : '#e2e8f0',
            background: filter === f.key ? '#1e3a5f' : '#fff',
            color: filter === f.key ? '#fff' : '#475569',
            fontSize: '12px', fontWeight: 500, cursor: 'pointer',
          }}>{f.label}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left' as const, fontSize: '12px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Event</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' as const, fontSize: '12px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Actor</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' as const, fontSize: '12px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Details</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' as const, fontSize: '12px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} style={{ padding: '40px', textAlign: 'center' as const, color: '#64748b' }}>Loading activity...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '40px', textAlign: 'center' as const, color: '#94a3b8' }}>No events match this filter</td></tr>
            )}
            {filtered.map((entry, i) => {
              const cfg = EVENT_CONFIG[entry.event_type] || { icon: '?', color: '#6b7280', bg: '#f9fafb', label: entry.event_type.replace(/_/g, ' ') };
              const isNew = newIds.has(entry.id);
              return (
                <tr key={entry.id} style={{ background: isNew ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#fafafa', borderLeft: entry.event_type === 'student_schedule_request' ? '3px solid #d97706' : '3px solid transparent' }}>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' as const }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: cfg.bg, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0, border: `1px solid ${cfg.color}30` }}>
                        {cfg.icon}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>{cfg.label}</div>
                        {entry.suggestion_id && <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{entry.suggestion_id.substring(0, 8)}...</div>}
                      </div>
                      {isNew && <span style={{ background: '#10b981', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '8px' }}>NEW</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' as const }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: getActorColor(entry.actor), background: getActorColor(entry.actor) + '14', padding: '3px 9px', borderRadius: '10px' }}>
                      {formatActor(entry.actor)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' as const }}>
                    {entry.payload && Object.keys(entry.payload).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '4px' }}>
                        {Object.entries(entry.payload).slice(0, 3).map(([key, val]) => (
                          <span key={key} style={{ fontSize: '11px', color: '#475569', background: '#f1f5f9', padding: '2px 7px', borderRadius: '5px' }}>
                            <strong>{key}:</strong> {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' as const, fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' as const }}>
                    {formatDate(entry.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '20px' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>Previous</button>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} style={{ padding: '7px 16px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>Next</button>
        </div>
      )}
    </div>
  );
}
