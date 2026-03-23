import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Suggestion, SuggestionType, SuggestionStatus } from '../types';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}` : '';

const TYPE_COLORS: Record<string, string> = {
  waitlist: '#2563eb',
  reschedule: '#7c3aed',
  discovery: '#059669',
  next_lesson: '#d97706',
  at_risk_nudge: '#dc2626',
};

const TYPE_LABELS: Record<string, string> = {
  waitlist: 'Waitlist Fill',
  reschedule: 'Reschedule',
  discovery: 'Discovery Flight',
  next_lesson: 'Next Lesson',
  at_risk_nudge: 'At-Risk Nudge',
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

function ExpiryCountdown({ expiresAt }: { expiresAt?: string }) {
  const [remaining, setRemaining] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setUrgent(diff < 2 * 3600000);
      setRemaining(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (!remaining) return null;
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
      background: urgent ? '#fef2f2' : '#f8fafc',
      color: urgent ? '#dc2626' : '#64748b',
      border: `1px solid ${urgent ? '#fca5a5' : '#e2e8f0'}`,
    }}>
      ⏱ {remaining}
    </span>
  );
}

function WeatherBadge({ constraints }: { constraints: string[] }) {
  const weatherLine = constraints.find(c => c.toLowerCase().includes('weather'));
  if (!weatherLine) return null;
  const isPass = weatherLine.toLowerCase().includes('pass');
  const label = weatherLine.replace(/weather forecast:\s*/i, '').replace(/pass\s*—\s*/i, '').replace(/fail\s*—\s*/i, '');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
      background: isPass ? '#f0fdf4' : '#fef2f2',
      color: isPass ? '#15803d' : '#dc2626',
      border: `1px solid ${isPass ? '#86efac' : '#fca5a5'}`,
    }}>
      {isPass ? '✅ VFR' : '⛈ Weather FAIL'} — {label}
    </span>
  );
}

function ConflictBadge({ conflictsWith }: { conflictsWith?: string[] }) {
  if (!conflictsWith || conflictsWith.length === 0) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
      background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d',
    }}>
      ⚠ Competing suggestion
    </span>
  );
}

function ConfidenceGauge({ confidence, score, weights }: {
  confidence: string;
  score?: number;
  weights?: { daysSinceLastFlight?: number; daysUntilNextFlight?: number; totalFlightHours?: number; waitlistPosition?: number; customWeights?: Record<string, number> };
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const pct = score != null ? Math.round(score * 100) : confidence === 'high' ? 90 : confidence === 'medium' ? 60 : 30;
  const color = confidence === 'high' ? '#22c55e' : confidence === 'medium' ? '#f59e0b' : '#ef4444';
  const size = 36;
  const r = 14;
  const circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(v => !v)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={4} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${fill} ${circ}`} strokeDashoffset={circ * 0.25}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.4s' }} />
        <text x={size/2} y={size/2 + 4} textAnchor="middle" fontSize="9" fontWeight="700" fill={color}>{pct}</text>
      </svg>
      <span style={{ fontSize: 11, fontWeight: 600, color, textTransform: 'capitalize' as const }}>{confidence}</span>

      {showTooltip && (
        <div style={{
          position: 'absolute', top: '120%', left: 0, zIndex: 100,
          background: '#1e293b', color: '#f1f5f9', borderRadius: 8,
          padding: '10px 14px', fontSize: 12, minWidth: 220, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap' as const,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>How this score was calculated:</div>
          <div>Days since last flight × 0.3</div>
          <div>Waitlist position × 0.4</div>
          <div>Days until next flight × 0.2</div>
          <div>Total flight hours × 0.1</div>
          {weights && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #334155', color: '#94a3b8' }}>
              <div>Last flight: {weights.daysSinceLastFlight ?? '—'}d ago</div>
              <div>Total hours: {weights.totalFlightHours ?? '—'}h</div>
              <div>Next flight: {weights.daysUntilNextFlight ?? '—'}d away</div>
            </div>
          )}
          <div style={{ marginTop: 6, color: '#64748b', fontSize: 11 }}>
            High ≥ 80 · Medium 50–79 · Low &lt; 50
          </div>
        </div>
      )}
    </span>
  );
}

export default function ApprovalQueue({ focusSuggestionId }: { focusSuggestionId?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') || 'pending');
  const [typeFilter, setTypeFilter] = useState<string>(() => searchParams.get('type') || '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [showDeclineModal, setShowDeclineModal] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declineExplanation, setDeclineExplanation] = useState('');
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const [approveHighLoading, setApproveHighLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('queue_onboarded'));
  const [listFocusIndex, setListFocusIndex] = useState(0);
  const sseRef = useRef<EventSource | null>(null);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const effectiveStatus = focusSuggestionId ? undefined : (statusFilter || undefined);
      const result = await api.getSuggestions({
        status: effectiveStatus,
        type: typeFilter || undefined,
        limit: focusSuggestionId ? 200 : undefined,
      });
      let list = result.data as Suggestion[];
      if (focusSuggestionId && !list.some(s => s.id === focusSuggestionId)) {
        try {
          const one = await api.getSuggestion(focusSuggestionId);
          list = [one.data as Suggestion, ...list];
        } catch { /* not found */ }
      }
      setSuggestions(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, focusSuggestionId]);

  useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

  useEffect(() => {
    if (focusSuggestionId) {
      setExpanded(focusSuggestionId);
      setPulseId(focusSuggestionId);
      const t = setTimeout(() => setPulseId(null), 5000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [focusSuggestionId]);

  useEffect(() => {
    if (!focusSuggestionId || suggestions.length === 0) return;
    const el = cardRefs.current.get(focusSuggestionId);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }, [focusSuggestionId, suggestions]);

  useEffect(() => {
    if (suggestions.length === 0) return;
    if (focusSuggestionId) {
      const i = suggestions.findIndex(s => s.id === focusSuggestionId);
      if (i >= 0) setListFocusIndex(i);
    }
  }, [suggestions, focusSuggestionId]);

  const syncFiltersToUrl = (status: string, type: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (status) next.set('status', status);
      else next.delete('status');
      if (type) next.set('type', type);
      else next.delete('type');
      return next;
    }, { replace: true });
  };

  const setStatusAndUrl = (v: string) => {
    setStatusFilter(v);
    syncFiltersToUrl(v, typeFilter);
  };

  const setTypeAndUrl = (v: string) => {
    setTypeFilter(v);
    syncFiltersToUrl(statusFilter, v);
  };

  const toggleExpanded = (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      navigate('/queue');
    } else {
      setExpanded(id);
      navigate(`/queue/${id}`);
    }
  };

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/queue/${id}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // SSE real-time listener
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || statusFilter !== 'pending') return;

    const url = `${API_BASE}/api/events/stream`;
    const es = new EventSource(`${url}?token=${token}`);
    sseRef.current = es;

    es.addEventListener('suggestion.created', () => {
      loadSuggestions();
      setLiveToast('New suggestion arrived!');
      setTimeout(() => setLiveToast(null), 4000);
    });
    es.addEventListener('suggestion.approved', () => { loadSuggestions(); });
    es.addEventListener('suggestion.declined', () => { loadSuggestions(); });
    es.addEventListener('student.schedule_draft_updated', () => {
      loadSuggestions();
      setLiveToast('Student updated a pending schedule draft');
      setTimeout(() => setLiveToast(null), 4000);
    });

    return () => { es.close(); sseRef.current = null; };
  }, [statusFilter, loadSuggestions]);

  const handleApprove = async (id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    try {
      await api.approveSuggestion(id);
      loadSuggestions();
    } catch (err: unknown) {
      loadSuggestions();
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
    const id = showDeclineModal;
    setSuggestions(prev => prev.filter(s => s.id !== id));
    setShowDeclineModal(null);
    setDeclineReason('');
    setDeclineExplanation('');
    try {
      await api.declineSuggestion(id, declineReason || undefined);
      loadSuggestions();
    } catch (err: unknown) {
      loadSuggestions();
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

  const handleApproveHighConfidence = async () => {
    setApproveHighLoading(true);
    try {
      const result = await api.approveHighConfidence();
      loadSuggestions();
      setLiveToast(`Approved ${result.approved} high-confidence suggestions`);
      setTimeout(() => setLiveToast(null), 5000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setApproveHighLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === suggestions.length) setSelected(new Set());
    else setSelected(new Set(suggestions.map(s => s.id)));
  };

  const canModify = user?.role === 'admin' || user?.role === 'scheduler';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showDeclineModal) return;
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      if (suggestions.length === 0) return;

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setListFocusIndex(i => Math.min(suggestions.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setListFocusIndex(i => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const id = suggestions[listFocusIndex]?.id;
        if (id) toggleExpanded(id);
      } else if (e.key === 'a' || e.key === 'A') {
        const s = suggestions[listFocusIndex];
        if (s?.status === 'pending' && canModify) {
          e.preventDefault();
          void handleApprove(s.id);
        }
      } else if (e.key === 'd' || e.key === 'D') {
        const s = suggestions[listFocusIndex];
        if (s?.status === 'pending' && canModify) {
          e.preventDefault();
          void handleDecline(s.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    suggestions,
    listFocusIndex,
    showDeclineModal,
    canModify,
    toggleExpanded,
    handleApprove,
    handleDecline,
  ]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const highConfidenceCount = suggestions.filter(
    s => s.status === 'pending' && s.rationale.confidence === 'high' &&
      !s.rationale.constraintsEvaluated.some(c => c.includes('FAIL'))
  ).length;

  return (
    <div style={{ position: 'relative' }}>
      {/* Onboarding tooltip */}
      {showOnboarding && (
        <div style={{
          background: '#1e3a5f', color: '#f1f5f9', borderRadius: 10,
          padding: '16px 20px', marginBottom: 16, position: 'relative',
        }}>
          <button
            onClick={() => { setShowOnboarding(false); localStorage.setItem('queue_onboarded', '1'); }}
            style={{ position: 'absolute', top: 10, right: 14, background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}
          >✕</button>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Welcome to the Approval Queue</div>
          <div style={{ fontSize: 13, color: '#93c5fd', lineHeight: 1.7 }}>
            The agent monitors your schedule 24/7 and surfaces suggestions here when it finds opportunities — cancellations to fill, students to reschedule, and discovery flights to book.
            <strong style={{ color: '#fff' }}> Every suggestion requires your review before anything is confirmed.</strong>
            You stay in control. The agent just does the heavy lifting.
          </div>
        </div>
      )}

      {/* Live toast */}
      {liveToast && (
        <div style={styles.liveToast}>{liveToast}</div>
      )}

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Approval Queue</h1>
          <p style={styles.subtitle}>
            Review and manage scheduling suggestions
            {statusFilter === 'pending' && (
              <span style={styles.liveDot}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block', marginRight: '5px' }} />
                Live
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
          {canModify && statusFilter === 'pending' && highConfidenceCount > 0 && (
            <button
              onClick={handleApproveHighConfidence}
              disabled={approveHighLoading}
              style={styles.highConfidenceBtn}
            >
              {approveHighLoading ? '...' : `⚡ Approve All High Confidence (${highConfidenceCount})`}
            </button>
          )}
          {canModify && selected.size > 0 && (
            <div style={styles.bulkActions}>
              <span style={styles.selectedCount}>{selected.size} selected</span>
              <button onClick={handleBulkApprove} style={styles.approveBtn}>Approve All</button>
              <button onClick={handleBulkDecline} style={styles.declineBtn}>Decline All</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ ...styles.filters, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 4 }}>
          j/k move · Enter open · a approve · d decline
        </span>
        <select value={statusFilter} onChange={e => setStatusAndUrl(e.target.value)} style={styles.select}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="expired">Expired</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeAndUrl(e.target.value)} style={styles.select}>
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
        <div style={{ ...styles.empty, textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
            {statusFilter === 'pending' ? 'No pending suggestions' : 'No suggestions found'}
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 320, margin: '0 auto' }}>
            {statusFilter === 'pending'
              ? 'The agent is watching for openings. Run the agent from the Dashboard to check for new scheduling opportunities.'
              : 'Try adjusting your filters.'}
          </div>
        </div>
      )}

      <div style={styles.list}>
        {suggestions.map((s, idx) => (
          <div
            key={s.id}
            ref={el => {
              if (el) cardRefs.current.set(s.id, el);
              else cardRefs.current.delete(s.id);
            }}
            style={{
            ...styles.card,
            ...(listFocusIndex === idx ? { outline: '2px solid #06b6d4', outlineOffset: 1 } : {}),
            ...(pulseId === s.id ? { boxShadow: '0 0 0 3px #3b82f6', transition: 'box-shadow 0.3s' } : {}),
            borderLeft: s.rationale.conflictsWith?.length
              ? '4px solid #f59e0b'
              : s.rationale.confidence === 'high' && !s.rationale.constraintsEvaluated.some(c => c.includes('FAIL'))
              ? '4px solid #10b981'
              : '4px solid transparent',
          }}
          >
            {/* "Why this matters" one-liner — pulls from AI summary when available */}
            <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, color: '#64748b', flexShrink: 0 }}>Why this matters →</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.rationale.summary
                  ? s.rationale.summary.split('.')[0] + '.'
                  : s.type === 'waitlist' ? `Open slot detected — ${s.payload.studentName} is top waitlist candidate`
                  : s.type === 'reschedule' ? `Previous cancellation needs to be filled for ${s.payload.studentName}`
                  : s.type === 'discovery' ? `New lead ${s.payload.studentName} is ready to book a discovery flight`
                  : s.type === 'next_lesson' ? `${s.payload.studentName} completed their last lesson — next one is ready to schedule`
                  : s.type === 'at_risk_nudge' ? `${s.payload.studentName} hasn't flown recently — graduation timeline at risk`
                  : s.rationale.trigger}
              </span>
            </div>

            <div style={styles.cardHeader}>
              {canModify && s.status === 'pending' && (
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} style={styles.checkbox} />
              )}
              <span style={{ ...styles.typeBadge, background: TYPE_COLORS[s.type as SuggestionType] || '#64748b' }}>{TYPE_LABELS[s.type as SuggestionType] || s.type}</span>
              <span style={{ ...styles.statusBadge, background: STATUS_COLORS[s.status] + '20', color: STATUS_COLORS[s.status] }}>{s.status}</span>
              {/* Confidence gauge */}
              <ConfidenceGauge confidence={s.rationale.confidence} score={s.rationale.candidateScore?.[0]?.score} weights={s.rationale.candidateScore?.[0]?.signals} />
              <ConflictBadge conflictsWith={s.rationale.conflictsWith} />
              <span style={styles.priority}>Priority: {s.priority}</span>
              <ExpiryCountdown expiresAt={s.expires_at} />
              <span style={styles.date}>{formatDate(s.created_at)}</span>
            </div>

            <div style={styles.cardBody}>
              {/* AI Natural Language Summary */}
              {s.rationale.summary && (
                <div style={styles.aiSummary}>
                  <span style={styles.aiSummaryLabel}>🤖 AI Analysis</span>
                  <p style={styles.aiSummaryText}>{s.rationale.summary}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' as const }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={styles.studentName}>{s.payload.studentName}</div>
                  <div style={styles.lessonType}>{s.payload.lessonType}</div>
                  <div style={styles.schedule}>
                    {formatDate(s.payload.startTime)} — {new Date(s.payload.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                  {s.payload.instructorName && <div style={styles.detail}>✈ {s.payload.instructorName}</div>}
                  {s.payload.aircraftTail && <div style={styles.detail}>🛩 {s.payload.aircraftTail}</div>}

                  <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
                    <WeatherBadge constraints={s.rationale.constraintsEvaluated} />
                  </div>

                  <div style={styles.trigger}><strong>Trigger:</strong> {s.rationale.trigger}</div>
                </div>

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

              <div style={styles.constraintTags}>
                {s.rationale.constraintsEvaluated.filter(c => !c.toLowerCase().includes('weather')).map((c, i) => (
                  <span key={i} style={{ ...styles.constraintTag, ...(c.includes('FAIL') ? styles.constraintTagFail : {}) }}>
                    {c.includes('FAIL') ? '✗' : '✓'} {c}
                  </span>
                ))}
              </div>
            </div>

            <div style={styles.cardFooter}>
              <span style={styles.altText}>Agent evaluated {s.rationale.alternativesConsidered} candidates</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const }}>
                <button type="button" onClick={() => copyLink(s.id)} style={styles.copyLinkBtn}>
                  {copiedId === s.id ? '✓ Copied' : 'Copy link'}
                </button>
                <button type="button" onClick={() => toggleExpanded(s.id)} style={styles.detailsBtn}>
                  {expanded === s.id ? 'Hide Details' : 'View Rationale'}
                </button>
                {canModify && s.status === 'pending' && (
                  <div style={styles.actions}>
                    <button onClick={() => handleApprove(s.id)} style={styles.approveBtn}>✓ Approve</button>
                    <button
                      onClick={() => handleDecline(s.id)}
                      disabled={decliningId === s.id}
                      style={styles.declineBtn}
                    >
                      {decliningId === s.id ? '...' : '✗ Decline'}
                    </button>
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
                  {(s.payload as any)?.lessonRequestId && (
                    <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#64748b', background: '#f1f5f9', borderRadius: '6px', padding: '8px 10px' }}>
                      This is a student schedule request — the student will receive an email notification with your reason.
                    </p>
                  )}
                  {declineExplanation && (
                    <div style={styles.aiExplanation}>
                      <div style={styles.aiExplanationLabel}>🤖 Agent Analysis</div>
                      <p style={styles.aiExplanationText}>{declineExplanation}</p>
                    </div>
                  )}
                  <textarea
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    placeholder="Add a reason (optional — helps the agent improve)..."
                    style={styles.declineTextarea}
                    rows={3}
                  />
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' },
  title: { fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' },
  subtitle: { color: '#64748b', margin: 0, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' },
  liveDot: { display: 'inline-flex', alignItems: 'center', fontSize: '11px', fontWeight: 600, color: '#10b981', background: '#f0fdf4', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '20px' },
  bulkActions: { display: 'flex', alignItems: 'center', gap: '8px' },
  selectedCount: { fontSize: '13px', color: '#64748b', fontWeight: 500 },
  highConfidenceBtn: { background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' },
  filters: { display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' as const },
  select: { padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: '#fff', color: '#374151' },
  list: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  card: { background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' as const, background: '#f8fafc' },
  checkbox: { marginRight: '4px' },
  typeBadge: { color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  statusBadge: { fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', textTransform: 'capitalize' as const },
  confidenceBadge: { fontSize: '12px', fontWeight: 600 },
  priority: { fontSize: '12px', color: '#64748b' },
  date: { fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' },
  cardBody: { padding: '14px 16px' },
  aiSummary: { background: 'linear-gradient(135deg, #f0f4ff, #eef2ff)', border: '1px solid #c7d2fe', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' },
  aiSummaryLabel: { fontSize: '10px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: '4px' },
  aiSummaryText: { fontSize: '13px', color: '#1e293b', lineHeight: '1.6', margin: 0, fontStyle: 'italic' },
  studentName: { fontSize: '16px', fontWeight: 700, color: '#1e293b' },
  lessonType: { fontSize: '13px', color: '#475569', marginTop: '2px' },
  schedule: { fontSize: '13px', color: '#2563eb', fontWeight: 600, marginTop: '5px' },
  detail: { fontSize: '12px', color: '#64748b', marginTop: '2px' },
  trigger: { fontSize: '12px', color: '#475569', background: '#f8fafc', border: '1px solid #f1f5f9', padding: '8px 12px', borderRadius: '6px', lineHeight: '1.5', marginTop: '8px' },
  cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid #f1f5f9', background: '#fafafa', flexWrap: 'wrap' as const, gap: '8px' },
  actions: { display: 'flex', gap: '8px' },
  approveBtn: { background: '#15803d', color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  declineBtn: { background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  copyLinkBtn: { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: '6px 12px', borderRadius: '6px' },
  detailsBtn: { background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', fontWeight: 500, cursor: 'pointer', padding: '4px 0' },
  rationalePanel: { padding: '14px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' },
  rationaleTitle: { fontSize: '13px', fontWeight: 600, color: '#374151', margin: '0 0 8px 0' },
  scorePanel: { width: '200px', flexShrink: 0, background: '#f8fafc', borderRadius: '6px', padding: '10px 12px', border: '1px solid #e2e8f0' },
  scorePanelTitle: { fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: '8px' },
  scoreRow: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' },
  scoreName: { fontSize: '11px', color: '#475569', width: '75px', display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 },
  winnerTag: { background: '#10b981', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '4px', fontWeight: 700 },
  scoreBarBg: { flex: 1, height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' },
  scoreBarFill: { height: '5px', borderRadius: '3px' },
  scoreNum: { fontSize: '11px', fontWeight: 700, color: '#1e293b', width: '20px', textAlign: 'right' as const },
  altText: { fontSize: '12px', color: '#94a3b8' },
  constraintTags: { display: 'flex', flexWrap: 'wrap' as const, gap: '4px', marginTop: '8px' },
  constraintTag: { fontSize: '10px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '8px', fontWeight: 500 },
  constraintTagFail: { background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' },
  candidateList: { display: 'flex', flexDirection: 'column' as const, gap: '8px', marginBottom: '14px' },
  candidateRow: { background: '#f8fafc', borderRadius: '6px', padding: '10px 14px', border: '1px solid #e2e8f0' },
  candidateWinner: { background: '#f0fdf4', border: '1px solid #86efac' },
  candidateHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  candidateName: { fontSize: '13px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' },
  winnerBadge: { background: '#10b981', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px' },
  candidateScore: { fontSize: '18px', fontWeight: 800, color: '#10b981' },
  signalChips: { display: 'flex', gap: '5px', flexWrap: 'wrap' as const },
  signalChip: { fontSize: '11px', color: '#475569', background: '#fff', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '10px' },
  altCount: { marginTop: '10px', fontSize: '12px', color: '#64748b' },
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  error: { color: '#dc2626', padding: '40px', textAlign: 'center' as const },
  empty: { color: '#94a3b8', padding: '40px', textAlign: 'center' as const, background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' },
  selectAllBar: { marginTop: '12px', textAlign: 'center' as const },
  selectAllBtn: { background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', padding: '7px 16px', color: '#475569', fontSize: '13px', cursor: 'pointer' },
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '460px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalTitle: { fontSize: '17px', fontWeight: 700, color: '#1e293b', margin: '0 0 14px 0' },
  aiExplanation: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' },
  aiExplanationLabel: { fontSize: '10px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px' },
  aiExplanationText: { fontSize: '13px', color: '#374151', lineHeight: '1.6', margin: 0 },
  declineTextarea: { width: '100%', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 10px', fontSize: '13px', resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' },
  cancelBtn: { background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', padding: '7px 16px', fontSize: '13px', cursor: 'pointer', color: '#475569' },
  confirmDeclineBtn: { background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  liveToast: { position: 'fixed' as const, top: '20px', right: '20px', background: '#1e3a5f', color: '#fff', padding: '12px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', animation: 'none' },
};
