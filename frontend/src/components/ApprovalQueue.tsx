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
  const [showDeclineModal, setShowDeclineModal] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declineExplanation, setDeclineExplanation] = useState('');
  const [decliningId, setDecliningId] = useState<string | null>(null);

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
    setDecliningId(id);
    setDeclineExplanation('');
    try {
      const result = await api.getDeclineExplanation(id);
      setDeclineExplanation(result.explanation);
    } catch {
      setDeclineExplanation('');
    }
    setShowDeclineModal(id);
    setDecliningId(null);
  };

  const confirmDecline = async () => {
    if (!showDeclineModal) return;
    try {
      await api.declineSuggestion(showDeclineModal, declineReason || undefined);
      setShowDeclineModal(null);
      setDeclineReason('');
      setDeclineExplanation('');
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
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} style={styles.checkbox} />
              )}
              <span style={{ ...styles.typeBadge, background: TYPE_COLORS[s.type] }}>{TYPE_LABELS[s.type]}</span>
              <span style={{ ...styles.statusBadge, background: STATUS_COLORS[s.status] + '20', color: STATUS_COLORS[s.status] }}>{s.status}</span>
              <span style={{ ...styles.confidenceBadge, color: CONFIDENCE_COLORS[s.rationale.confidence] }}>{s.rationale.confidence} confidence</span>
              <span style={styles.priority}>Priority: {s.priority}</span>
              <span style={styles.date}>{formatDate(s.created_at)}</span>
            </div>

            <div style={styles.cardBody}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                  <div style={styles.studentName}>{s.payload.studentName}</div>
                  <div style={styles.lessonType}>{s.payload.lessonType}</div>
                  <div style={styles.schedule}>
                    {formatDate(s.payload.startTime)} — {new Date(s.payload.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                  {s.payload.instructorName && <div style={styles.detail}>✈ {s.payload.instructorName}</div>}
                  {s.payload.aircraftTail && <div style={styles.detail}>🛩 {s.payload.aircraftTail}</div>}

                  {/* Weather tag - shown inline */}
                  {s.rationale.constraintsEvaluated.find((c: string) => c.toLowerCase().includes('weather')) && (
                    <div style={styles.weatherTag}>
                      {s.rationale.constraintsEvaluated.find((c: string) => c.toLowerCase().includes('weather'))?.includes('pass')
                        ? '✅ ' : '⚠ '}
                      {s.rationale.constraintsEvaluated.find((c: string) => c.toLowerCase().includes('weather'))?.replace('weather forecast: pass — ', '').replace('weather forecast: FAIL — ', '')}
                    </div>
                  )}

                  <div style={styles.trigger}><strong>Trigger:</strong> {s.rationale.trigger}</div>
                </div>

                {/* Inline candidate score bars */}
                {s.rationale.candidateScore.length > 0 && (
                  <div style={styles.scorePanel}>
                    <div style={styles.scorePanelTitle}>Candidate scoring</div>
                    {s.rationale.candidateScore.map((c, i) => (
                      <div key={i} style={styles.scoreRow}>
                        <div style={styles.scoreName}>
                          {c.name}
                          {i === 0 && <span style={styles.winnerTag}>✓</span>}
                        </div>
                        <div style={styles.scoreBarBg}>
                          <div style={{ ...styles.scoreBarFill, width: `${c.score * 100}%`, background: i === 0 ? '#10b981' : '#94a3b8' }} />
                        </div>
                        <span style={styles.scoreNum}>{(c.score * 100).toFixed(0)}</span>
                      </div>
                    ))}
                    <div style={styles.altCount}>{s.rationale.alternativesConsidered} candidates evaluated</div>
                  </div>
                )}
              </div>

              {/* Constraint tags */}
              <div style={styles.constraintTags}>
                {s.rationale.constraintsEvaluated.filter((c: string) => !c.toLowerCase().includes('weather')).map((c: string, i: number) => (
                  <span key={i} style={{ ...styles.constraintTag, ...(c.includes('FAIL') ? styles.constraintTagFail : {}) }}>
                    {c.includes('FAIL') ? '✗' : '✓'} {c}
                  </span>
                ))}
              </div>
            </div>

            <div style={styles.cardFooter}>
              <span style={styles.altText}>Agent evaluated {s.rationale.alternativesConsidered} candidates before selecting</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} style={styles.detailsBtn}>
                  {expanded === s.id ? 'Hide Details' : 'View Rationale'}
                </button>
                {canModify && s.status === 'pending' && (
                  <div style={styles.actions}>
                    <button onClick={() => handleApprove(s.id)} style={styles.approveBtn}>✓ Approve</button>
                    <button onClick={() => handleDecline(s.id)} style={styles.declineBtn}>✗ Decline</button>
                  </div>
                )}
              </div>
            </div>

            {expanded === s.id && (
              <div style={styles.rationalePanel}>
                <h4 style={styles.rationaleTitle}>Full Candidate Details</h4>
                <div style={styles.candidateList}>
                  {s.rationale.candidateScore.map((c, i) => (
                    <div key={i} style={{ ...styles.candidateRow, ...(i === 0 ? styles.candidateWinner : {}) }}>
                      <div style={styles.candidateHeader}>
                        <div style={styles.candidateName}>
                          {i === 0 && <span style={styles.winnerBadge}>✓ Selected</span>}
                          {c.name}
                        </div>
                        <div style={styles.candidateScore}>{(c.score * 100).toFixed(0)}</div>
                      </div>
                      <div style={styles.scoreBarBg}>
                        <div style={{ ...styles.scoreBarFill, width: `${c.score * 100}%`, background: i === 0 ? '#10b981' : '#94a3b8' }} />
                      </div>
                      <div style={styles.signalChips}>
                        <span style={styles.signalChip}>✈ {c.signals.totalFlightHours}h total</span>
                        <span style={styles.signalChip}>⏱ {c.signals.daysSinceLastFlight}d since last flight</span>
                        <span style={styles.signalChip}>📅 {c.signals.daysUntilNextFlight}d until next</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={styles.altCount}>Selected from {s.rationale.alternativesConsidered} evaluated candidates</div>
              </div>
            )}

            {showDeclineModal === s.id && (
              <div style={styles.modalOverlay}>
                <div style={styles.modal}>
                  <h3 style={styles.modalTitle}>Decline Suggestion</h3>
                  {declineExplanation && (
                    <div style={styles.aiExplanation}>
                      <div style={styles.aiExplanationLabel}>🤖 Agent Analysis</div>
                      <p style={styles.aiExplanationText}>{declineExplanation}</p>
                    </div>
                  )}
                  <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="Add a reason (optional)..." style={styles.declineTextarea} rows={3} />
                  <div style={styles.modalActions}>
                    <button onClick={() => { setShowDeclineModal(null); setDeclineReason(''); setDeclineExplanation(''); }} style={styles.cancelBtn}>Cancel</button>
                    <button onClick={confirmDecline} style={styles.confirmDeclineBtn}>Confirm Decline</button>
                  </div>
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
  weatherTag: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#15803d', background: '#f0fdf4', border: '0.5px solid #86efac', padding: '3px 10px', borderRadius: '20px', margin: '6px 0 8px', fontWeight: 500 },
  scorePanel: { width: '220px', flexShrink: 0, background: '#f8fafc', borderRadius: '8px', padding: '12px 14px' },
  scorePanelTitle: { fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: '8px' },
  scoreRow: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' },
  scoreName: { fontSize: '11px', color: '#475569', width: '80px', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 },
  winnerTag: { background: '#10b981', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '4px', fontWeight: 700 },
  scoreBarBg: { flex: 1, height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' },
  scoreBarFill: { height: '5px', borderRadius: '3px', transition: 'width 0.5s ease' },
  scoreNum: { fontSize: '11px', fontWeight: 700, color: '#0f172a', width: '22px', textAlign: 'right' as const },
  altCount: { fontSize: '10px', color: '#94a3b8', marginTop: '6px' },
  altText: { fontSize: '12px', color: '#94a3b8' },
  constraintTags: { display: 'flex', flexWrap: 'wrap' as const, gap: '5px', marginTop: '10px' },
  constraintTag: { fontSize: '10px', background: '#f0fdf4', color: '#15803d', border: '0.5px solid #86efac', padding: '2px 8px', borderRadius: '8px', fontWeight: 500 },
  constraintTagFail: { background: '#fef2f2', color: '#dc2626', border: '0.5px solid #fca5a5' },
  actions: { display: 'flex', gap: '8px' },
  approveBtn: { background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  declineBtn: { background: '#fff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  detailsBtn: { background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: 500, cursor: 'pointer', padding: '4px 0' },
  rationalePanel: { padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' },
  rationaleTitle: { fontSize: '14px', fontWeight: 600, color: '#334155', margin: '16px 0 8px 0' },
  candidateList: { display: 'flex', flexDirection: 'column' as const, gap: '10px', marginBottom: '16px' },
  candidateRow: { background: '#f8fafc', borderRadius: '8px', padding: '12px 16px', border: '1px solid #e2e8f0' },
  candidateWinner: { background: '#f0fdf4', border: '1px solid #86efac' },
  candidateHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  candidateName: { fontSize: '14px', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' },
  winnerBadge: { background: '#10b981', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px' },
  candidateScore: { fontSize: '20px', fontWeight: 800, color: '#10b981' },
  signalChips: { display: 'flex', gap: '6px', flexWrap: 'wrap' as const },
  signalChip: { fontSize: '11px', color: '#475569', background: '#fff', border: '1px solid #e2e8f0', padding: '3px 8px', borderRadius: '10px' },
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  error: { color: '#dc2626', padding: '40px', textAlign: 'center' as const },
  empty: { color: '#94a3b8', padding: '40px', textAlign: 'center' as const, background: '#fff', borderRadius: '10px' },
  selectAllBar: { marginTop: '12px', textAlign: 'center' as const },
  selectAllBtn: { background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 16px', color: '#475569', fontSize: '13px', cursor: 'pointer' },
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '12px', padding: '28px', width: '480px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalTitle: { fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px 0' },
  aiExplanation: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px' },
  aiExplanationLabel: { fontSize: '11px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '8px' },
  aiExplanationText: { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: 0 },
  declineTextarea: { width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' },
  cancelBtn: { background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', color: '#475569' },
  confirmDeclineBtn: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
};
