import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { AuditEntry } from '../types';

const EVENT_ICONS: Record<string, string> = {
  suggestion_created: '+',
  suggestion_approved: '\u2713',
  suggestion_declined: '\u2717',
  config_updated: '\u2699',
  feature_flags_updated: '\u2691',
};

const EVENT_COLORS: Record<string, string> = {
  suggestion_created: '#2563eb',
  suggestion_approved: '#10b981',
  suggestion_declined: '#ef4444',
  config_updated: '#7c3aed',
  feature_flags_updated: '#d97706',
};

export default function ActivityFeed() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadEntries();
  }, [page]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const result = await api.getAuditLog({ page, limit: 20 });
      setEntries(result.data as AuditEntry[]);
      setTotal(result.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
    });
  };

  const formatEventType = (t: string) => {
    return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const formatActor = (a: string) => {
    if (a === 'agent') return 'Agent Engine';
    if (a.startsWith('scheduler:')) return 'Dispatcher';
    return a;
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 style={styles.title}>Activity Feed</h1>
      <p style={styles.subtitle}>Immutable audit log of all system activity</p>

      {loading && <div style={styles.loading}>Loading activity...</div>}
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.timeline}>
        {entries.map(entry => {
          const color = EVENT_COLORS[entry.event_type] || '#6b7280';
          const icon = EVENT_ICONS[entry.event_type] || '?';
          return (
            <div key={entry.id} style={styles.entry}>
              <div style={{ ...styles.icon, background: color + '15', color, borderColor: color }}>
                {icon}
              </div>
              <div style={styles.content}>
                <div style={styles.entryHeader}>
                  <span style={styles.eventType}>{formatEventType(entry.event_type)}</span>
                  <span style={styles.actor}>{formatActor(entry.actor)}</span>
                  <span style={styles.time}>{formatDate(entry.created_at)}</span>
                </div>
                {entry.suggestion_id && (
                  <div style={styles.suggestionId}>
                    Suggestion: {entry.suggestion_id.substring(0, 8)}...
                  </div>
                )}
                {entry.payload && Object.keys(entry.payload).length > 0 && (
                  <div style={styles.payload}>
                    {Object.entries(entry.payload).map(([key, val]) => (
                      <span key={key} style={styles.payloadItem}>
                        <strong>{key}:</strong> {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={styles.pageBtn}
          >
            Previous
          </button>
          <span style={styles.pageInfo}>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= totalPages}
            style={styles.pageBtn}
          >
            Next
          </button>
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div style={styles.empty}>No activity recorded yet</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: '28px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' },
  subtitle: { color: '#64748b', margin: '0 0 28px 0', fontSize: '15px' },
  timeline: { display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  entry: {
    display: 'flex',
    gap: '16px',
    padding: '16px 20px',
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  icon: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 700,
    flexShrink: 0,
    border: '2px solid',
  },
  content: { flex: 1, minWidth: 0 },
  entryHeader: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' as const },
  eventType: { fontWeight: 600, color: '#0f172a', fontSize: '14px' },
  actor: { fontSize: '13px', color: '#2563eb', fontWeight: 500 },
  time: { fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' },
  suggestionId: { fontSize: '12px', color: '#64748b', marginTop: '4px', fontFamily: 'monospace' },
  payload: { display: 'flex', flexWrap: 'wrap' as const, gap: '8px', marginTop: '8px' },
  payloadItem: { fontSize: '12px', color: '#475569', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '20px' },
  pageBtn: { padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px' },
  pageInfo: { fontSize: '13px', color: '#64748b' },
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  error: { color: '#dc2626', padding: '40px', textAlign: 'center' as const },
  empty: { color: '#94a3b8', padding: '40px', textAlign: 'center' as const, background: '#fff', borderRadius: '10px' },
};
