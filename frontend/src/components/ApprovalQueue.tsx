import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Suggestion, SuggestionType, SuggestionStatus } from '../types';
import { useAuth } from '../context/AuthContext';

const TYPE_COLORS: Record<SuggestionType, string> = {
  waitlist: '#2563eb',
  reschedule: '#7c3aed',
  discovery: '#059669',
  next_lesson: '#d97706',
};

const TYPE_LABELS: Record<SuggestionType, string> = {
  waitlist: 'Waitlist Fill',
  reschedule: 'Reschedule',
  discovery: 'Discovery Flight',
  next_lesson: 'Next Lesson',
};

const STATUS_COLORS: Record<SuggestionStatus, string> = {
  pending: '#f59e0b',
  approved: '#10b981',
  declined: '#ef4444',
  expired: '#6b7280',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#10b981',
  medium: '#f59e0b',
  low: '#ef4444',
};

export default function ApprovalQueue() {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadSuggestions();
  }, [statusFilter, typeFilter]);

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const result = await api.getSuggestions({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
      });
      setSuggestions(result.data as Suggestion[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.approveSuggestion(id);
      loadSuggestions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDecline = async (id: string) => {
    const reason = prompt('Reason for declining (optional):');
    try {
      await api.declineSuggestion(id, reason || undefined);
      loadSuggestions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    try {
      await api.bulkApprove([...selected]);
      setSelected(new Set());
      loadSuggestions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleBulkDecline = async () => {
    if (selected.size === 0) return;
    const reason = prompt('Reason for declining (optional):');
    try {
      await api.bulkDecline([...selected], reason || undefined);
      setSelected(new Set());
      loadSuggestions();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === suggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map(s => s.id)));
    }
  };

  const canModify = user?.role === 'admin' || user?.role === 'scheduler';

  const formatDate = (d: string) => {
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Approval Queue</h1>
          <p style={styles.subtitle}>Review and manage scheduling suggestions</p>
        </div>
        {canModify && selected.size > 0 && (
          <div style={styles.bulkActions}>
            <span style={styles.selectedCount}>{selected.size} selected</span>
            <button onClick={handleBulkApprove} style={styles.approveBtn}>Approve All</button>
            <button onClick={handleBulkDecline} style={styles.declineBtn}>Decline All</button>
          </div>
        )}
      </div>

      <div style={styles.filters}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={styles.select}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="expired">Expired</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={styles.select}>
          <option value="">All Types</option>
          <option value="waitlist">Waitlist Fill</option>
          <option value="reschedule">Reschedule</option>
          <option value="discovery">Discovery Flight</option>
          <option value="next_lesson">Next Lesson</option>
        </select>
      </div>

      {loading && <div style={styles.loading}>Loading suggestions...</div>}
      {error && <div style={styles.error}>{error}</div>}

      {!loading && suggestions.length === 0 && (
        <div style={styles.empty}>No suggestions found</div>
      )}

      <div style={styles.list}>
        {suggestions.map(s => (
          <div key={s.id} style={styles.card}>
            <div style={styles.cardHeader}>
              {canModify && s.status === 'pending' && (
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggleSelect(s.id)}
                  style={styles.checkbox}
                />
              )}
              <span style={{ ...styles.typeBadge, background: TYPE_COLORS[s.type] }}>
                {TYPE_LABELS[s.type]}
              </span>
              <span style={{ ...styles.statusBadge, background: STATUS_COLORS[s.status] + '20', color: STATUS_COLORS[s.status] }}>
                {s.status}
              </span>
              <span style={{ ...styles.confidenceBadge, color: CONFIDENCE_COLORS[s.rationale.confidence] }}>
                {s.rationale.confidence} confidence
              </span>
              <span style={styles.priority}>Priority: {s.priority}</span>
              <span style={styles.date}>{formatDate(s.created_at)}</span>
            </div>

            <div style={styles.cardBody}>
              <div style={styles.mainInfo}>
                <div style={styles.studentName}>{s.payload.studentName}</div>
                <div style={styles.lessonType}>{s.payload.lessonType}</div>
                <div style={styles.schedule}>
                  {formatDate(s.payload.startTime)} - {new Date(s.payload.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
                {s.payload.instructorName && (
                  <div style={styles.detail}>Instructor: {s.payload.instructorName}</div>
                )}
                {s.payload.aircraftTail && (
                  <div style={styles.detail}>Aircraft: {s.payload.aircraftTail}</div>
                )}
              </div>

              <div style={styles.trigger}>
                <strong>Trigger:</strong> {s.rationale.trigger}
              </div>
            </div>

            <div style={styles.cardFooter}>
              <button
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                style={styles.detailsBtn}
              >
                {expanded === s.id ? 'Hide Details' : 'View Rationale'}
              </button>
              {canModify && s.status === 'pending' && (
                <div style={styles.actions}>
                  <button onClick={() => handleApprove(s.id)} style={styles.approveBtn}>Approve</button>
                  <button onClick={() => handleDecline(s.id)} style={styles.declineBtn}>Decline</button>
                </div>
              )}
            </div>

            {expanded === s.id && (
              <div style={styles.rationalePanel}>
                <h4 style={styles.rationaleTitle}>Candidate Scoring</h4>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Candidate</th>
                      <th style={styles.th}>Score</th>
                      <th style={styles.th}>Days Since Flight</th>
                      <th style={styles.th}>Days Until Next</th>
                      <th style={styles.th}>Total Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rationale.candidateScore.map((c, i) => (
                      <tr key={i} style={i === 0 ? { background: '#f0fdf4' } : {}}>
                        <td style={styles.td}>{c.name}</td>
                        <td style={styles.td}><strong>{c.score.toFixed(2)}</strong></td>
                        <td style={styles.td}>{c.signals.daysSinceLastFlight}</td>
                        <td style={styles.td}>{c.signals.daysUntilNextFlight}</td>
                        <td style={styles.td}>{c.signals.totalFlightHours}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h4 style={styles.rationaleTitle}>Constraints Evaluated</h4>
                <div style={styles.constraints}>
                  {s.rationale.constraintsEvaluated.map((c, i) => (
                    <span key={i} style={styles.constraint}>{c}</span>
                  ))}
                </div>
                <div style={styles.altCount}>
                  {s.rationale.alternativesConsidered} alternatives considered
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && suggestions.length > 0 && canModify && statusFilter === 'pending' && (
        <div style={styles.selectAllBar}>
          <button onClick={toggleSelectAll} style={styles.selectAllBtn}>
            {selected.size === suggestions.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  title: { fontSize: '28px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' },
  subtitle: { color: '#64748b', margin: 0, fontSize: '15px' },
  bulkActions: { display: 'flex', alignItems: 'center', gap: '8px' },
  selectedCount: { fontSize: '13px', color: '#64748b', fontWeight: 500 },
  filters: { display: 'flex', gap: '12px', marginBottom: '20px' },
  select: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff' },
  list: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  card: { background: '#fff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' as const },
  checkbox: { marginRight: '4px' },
  typeBadge: { color: '#fff', fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  statusBadge: { fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px', textTransform: 'capitalize' as const },
  confidenceBadge: { fontSize: '12px', fontWeight: 600, marginLeft: 'auto' },
  priority: { fontSize: '12px', color: '#64748b' },
  date: { fontSize: '12px', color: '#94a3b8' },
  cardBody: { padding: '16px 20px' },
  mainInfo: { marginBottom: '12px' },
  studentName: { fontSize: '18px', fontWeight: 600, color: '#0f172a' },
  lessonType: { fontSize: '14px', color: '#475569', marginTop: '2px' },
  schedule: { fontSize: '13px', color: '#2563eb', fontWeight: 500, marginTop: '6px' },
  detail: { fontSize: '13px', color: '#64748b', marginTop: '2px' },
  trigger: { fontSize: '13px', color: '#475569', background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', lineHeight: '1.5' },
  cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #f1f5f9' },
  actions: { display: 'flex', gap: '8px' },
  approveBtn: { background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  declineBtn: { background: '#fff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  detailsBtn: { background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: 500, cursor: 'pointer', padding: '4px 0' },
  rationalePanel: { padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' },
  rationaleTitle: { fontSize: '14px', fontWeight: 600, color: '#334155', margin: '16px 0 8px 0' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px', marginBottom: '16px' },
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 },
  td: { padding: '8px 12px', borderBottom: '1px solid #f1f5f9', color: '#334155' },
  constraints: { display: 'flex', flexWrap: 'wrap' as const, gap: '6px' },
  constraint: { background: '#ecfdf5', color: '#059669', fontSize: '12px', padding: '4px 10px', borderRadius: '12px', fontWeight: 500 },
  altCount: { marginTop: '12px', fontSize: '12px', color: '#64748b' },
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  error: { color: '#dc2626', padding: '40px', textAlign: 'center' as const },
  empty: { color: '#94a3b8', padding: '40px', textAlign: 'center' as const, background: '#fff', borderRadius: '10px' },
  selectAllBar: { marginTop: '12px', textAlign: 'center' as const },
  selectAllBtn: { background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 16px', color: '#475569', fontSize: '13px', cursor: 'pointer' },
};
