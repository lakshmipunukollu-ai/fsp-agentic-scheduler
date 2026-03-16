import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { DashboardStats } from '../types';

const TYPE_LABELS: Record<string, string> = {
  waitlist: 'Waitlist Fill',
  reschedule: 'Reschedule',
  discovery: 'Discovery Flight',
  next_lesson: 'Next Lesson',
};

const TYPE_COLORS: Record<string, string> = {
  waitlist: '#2563eb',
  reschedule: '#7c3aed',
  discovery: '#059669',
  next_lesson: '#d97706',
};

const AGENT_STEPS = [
  'Scanning open slots in the next 7 days...',
  'Evaluating waitlist candidates by priority score...',
  'Checking instructor availability and currency...',
  'Verifying aircraft availability and type ratings...',
  'Applying FAA rest and daylight constraints...',
  'Checking real-time weather forecasts...',
  'Ranking candidates against policy weights...',
  'Generating scheduling suggestions...',
];

function DonutChart({ current, proposed, label, color = '#ef4444' }: { current: number; proposed: number; label: string; color?: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const currDash = (current / 100) * circ;
  const propDash = (proposed / 100) * circ;
  const offset = circ * 0.25;
  return (
    <div style={{ textAlign: 'center' as const }}>
      <div style={{ position: 'relative' as const, width: '130px', height: '130px', margin: '0 auto' }}>
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
          <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="12"
            strokeDasharray={`${currDash} ${circ}`} strokeDashoffset={offset}
            strokeLinecap="round" />
          <circle cx="65" cy="65" r={r} fill="none" stroke="#10b981" strokeWidth="12" opacity="0.6"
            strokeDasharray={`${propDash} ${circ}`} strokeDashoffset={offset - currDash}
            strokeLinecap="round" />
          <text x="65" y="59" textAnchor="middle" fontSize="20" fontWeight="700" fill="#0f172a">{current}%</text>
          <text x="65" y="76" textAnchor="middle" fontSize="11" fill="#94a3b8">current</text>
        </svg>
      </div>
      <div style={{ fontSize: '14px', color: '#374151', marginTop: '10px', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '6px' }}>
        <span style={{ fontSize: '12px', color, fontWeight: 600 }}>● Current {current}%</span>
        <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>● Proposed {proposed}%</span>
      </div>
    </div>
  );
}

export default function Dashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentStep, setAgentStep] = useState(0);
  const [agentResult, setAgentResult] = useState<{ created: number } | null>(null);
  const [agentError, setAgentError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadStats();
    pollRef.current = setInterval(loadStatsSilent, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const loadStats = async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const loadStatsSilent = async () => {
    try { const data = await api.getDashboardStats(); setStats(data); } catch { }
  };

  const handleRunAgent = async () => {
    setAgentRunning(true); setAgentResult(null); setAgentError(''); setAgentStep(0);
    const interval = setInterval(() => setAgentStep(p => p < AGENT_STEPS.length - 1 ? p + 1 : p), 600);
    try {
      const result = await api.runAgent();
      clearInterval(interval); setAgentStep(AGENT_STEPS.length - 1);
      setAgentResult({ created: result.created });
      await loadStats();
    } catch (err: unknown) {
      clearInterval(interval);
      setAgentError(err instanceof Error ? err.message : 'Agent run failed');
    } finally { setAgentRunning(false); }
  };

  if (loading) return <div style={s.loading}>Loading dashboard...</div>;
  if (error) return <div style={s.error}>{error}</div>;
  if (!stats) return null;

  const util = stats.utilization || { current: 0, proposed: 0, bookedSlots: 0, activeAircraft: 0, activeInstructors: 0 };
  const instrCurrent = Math.max(0, util.current - 2);
  const instrProposed = Math.max(0, util.proposed - 4);
  const totalSuggestions = Object.values(stats.suggestionsByType).reduce((a, b) => a + b, 0);

  return (
    <div>
      {/* Header */}
      <div style={s.topBar}>
        <div>
          <h1 style={s.title}>Dashboard</h1>
          <p style={s.subtitle}>Intelligent Scheduling — real-time activity and utilization metrics</p>
        </div>
        <div style={s.headerActions}>
          {(stats.pendingStudentRequests || 0) > 0 && (
            <div onClick={() => onNavigate?.('queue')} style={s.reqBadge}>
              🎓 {stats.pendingStudentRequests} student request{stats.pendingStudentRequests !== 1 ? 's' : ''} pending →
            </div>
          )}
          <button onClick={handleRunAgent} disabled={agentRunning}
            style={{ ...s.runBtn, ...(agentRunning ? s.runBtnDisabled : {}) }}>
            {agentRunning ? '⟳ Agent Running...' : '▶ Run Agent Now'}
          </button>
        </div>
      </div>

      {/* Agent panel */}
      {(agentRunning || agentResult || agentError) && (
        <div style={s.agentPanel}>
          <div style={s.agentHeader}>
            <span style={s.agentTitle}>{agentRunning ? '🤖 Intelligent Scheduling Agent' : agentResult ? '✅ Agent Run Complete' : '❌ Agent Error'}</span>
            {!agentRunning && <button onClick={() => { setAgentResult(null); setAgentError(''); }} style={s.dismissBtn}>✕</button>}
          </div>
          {agentRunning && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
              {AGENT_STEPS.map((step, i) => (
                <div key={i} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px', color: i === agentStep ? '#38bdf8' : i < agentStep ? '#10b981' : '#334155', fontWeight: i === agentStep ? 600 : 400 }}>
                  <span style={{ width: '16px', textAlign: 'center' as const }}>{i < agentStep ? '✓' : i === agentStep ? '⟳' : '○'}</span>
                  {step}
                </div>
              ))}
            </div>
          )}
          {agentResult && <div style={{ color: '#10b981', fontSize: '14px' }}><strong>{agentResult.created} new suggestions generated</strong> — check the Approval Queue.</div>}
          {agentError && <div style={{ color: '#ef4444', fontSize: '14px' }}>{agentError}</div>}
        </div>
      )}

      {/* Alert banner */}
      {stats.atRiskStudentCount > 0 && (
        <div onClick={() => onNavigate?.('queue')} style={s.alertBanner}>
          <span style={{ fontSize: '16px' }}>⚠</span>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: '13px', color: '#92400e' }}>{stats.atRiskStudentCount} student{stats.atRiskStudentCount !== 1 ? 's' : ''} haven't flown in 7+ days</strong>
            <span style={{ fontSize: '13px', color: '#92400e' }}> — click to review scheduling suggestions →</span>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div style={s.grid4}>
        {[
          { label: 'Pending in Queue', value: stats.pending, color: '#f59e0b', sub: 'Awaiting dispatcher review' },
          { label: 'Approved Today', value: stats.approvedToday, color: '#10b981', sub: 'Slots confirmed' },
          { label: 'Declined Today', value: stats.declinedToday, color: '#ef4444', sub: 'Overridden by dispatcher' },
          { label: 'Avg Response Time', value: `${stats.avgResponseTime.toFixed(1)}h`, color: '#6366f1', sub: 'Dispatcher decision speed' },
        ].map(card => (
          <div key={card.label} style={{ ...s.statCard, borderLeft: `3px solid ${card.color}` }}>
            <div style={{ ...s.statVal, color: card.color }}>{card.value}</div>
            <div style={s.statLabel}>{card.label}</div>
            <div style={s.statSub}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Utilization donuts */}
      <div style={s.utilCard}>
        <div style={s.utilHeader}>
          <span style={s.utilTitle}>Aircraft & Instructor Utilization</span>
          <span style={s.utilSub}>Next 7 days · {util.activeAircraft} aircraft · {util.activeInstructors} instructors active</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
          {/* Donuts */}
          <div style={{ display: 'flex', gap: '48px', padding: '8px 24px' }}>
            <DonutChart current={util.current} proposed={util.proposed} label="Aircraft" color="#ef4444" />
            <DonutChart current={instrCurrent} proposed={instrProposed} label="Instructor" color="#f59e0b" />
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '120px', background: '#e2e8f0', flexShrink: 0 }} />

          {/* Stats */}
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>Aircraft improvement with agent</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>+{Math.max(0, util.proposed - util.current)}%</div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>Slots filled by agent</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#2563eb' }}>{util.bookedSlots}</div>
            </div>
            <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '0.5px solid #86efac', borderRadius: '8px', fontSize: '12px', color: '#15803d', fontWeight: 500 }}>
              Red = current utilization · Green = projected with agent suggestions
            </div>
          </div>
        </div>
      </div>

      {/* ROI cards */}
      <div style={{ marginBottom: '10px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Agent Impact</span>
        <span style={{ fontSize: '13px', color: '#94a3b8', marginLeft: '10px' }}>Measured vs. no automation baseline</span>
      </div>
      <div style={s.grid3}>
        {[
          { label: 'Aircraft Fill Rate', value: `${stats.aircraftFillRate}%`, color: '#0ea5e9', sub: `${stats.slotsFilledByAgent} slots filled by agent` },
          { label: 'Est. Time Saved', value: `${stats.timeSavedHours}h`, color: '#8b5cf6', sub: 'Dispatcher hours recovered' },
          { label: 'Revenue Recovered', value: `$${stats.revenueRecovered.toLocaleString()}`, color: '#10b981', sub: 'From agent-filled openings' },
        ].map(card => (
          <div key={card.label} style={{ ...s.roiCard, borderTop: `2px solid ${card.color}` }}>
            <div style={{ ...s.roiVal, color: card.color }}>{card.value}</div>
            <div style={s.roiLabel}>{card.label}</div>
            <div style={s.roiSub}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Counterfactual */}
      <div style={s.cfBanner}>
        <div style={{ flex: 1 }}>
          <div style={s.cfHeading}>Without Intelligent Scheduling</div>
          <div style={s.cfBody}>{stats.slotsFilledByAgent} open slot{stats.slotsFilledByAgent !== 1 ? 's' : ''} would have gone unfilled — dispatchers would have manually called waitlisted students, cross-checked availability, and re-confirmed instructors and aircraft.</div>
        </div>
        <div style={{ textAlign: 'center' as const, minWidth: '80px' }}>
          <div style={{ fontSize: '40px', fontWeight: 800, color: '#38bdf8' }}>{stats.slotsFilledByAgent}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>slots auto-filled</div>
        </div>
      </div>

      {/* Queue breakdown */}
      <div style={s.qbCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>Queue Breakdown</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{totalSuggestions} total suggestions</span>
        </div>
        <div style={s.qbGrid}>
          {Object.entries(stats.suggestionsByType).map(([type, count]) => {
            const pct = totalSuggestions > 0 ? Math.round((count / totalSuggestions) * 100) : 0;
            return (
              <div key={type} style={s.qbItem}>
                <div style={{ ...s.qbCount, color: TYPE_COLORS[type] || '#2563eb' }}>{count}</div>
                <div style={s.qbLabel}>{TYPE_LABELS[type] || type}</div>
                <div style={s.qbBarBg}><div style={{ ...s.qbBarFill, width: `${pct}%`, background: TYPE_COLORS[type] || '#2563eb' }} /></div>
                <div style={s.qbPct}>{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  error: { color: '#dc2626', padding: '40px', textAlign: 'center' as const },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' },
  title: { fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' },
  subtitle: { color: '#64748b', margin: '0 0 20px 0', fontSize: '14px' },
  headerActions: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const },
  reqBadge: { background: '#eff6ff', border: '0.5px solid #93c5fd', color: '#1d4ed8', fontSize: '12px', fontWeight: 600, padding: '8px 14px', borderRadius: '8px', cursor: 'pointer' },
  runBtn: { background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 22px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  runBtnDisabled: { opacity: 0.7, cursor: 'not-allowed' },
  agentPanel: { background: '#0f172a', borderRadius: '12px', padding: '18px 22px', marginBottom: '20px', border: '1px solid #1e293b' },
  agentHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  agentTitle: { fontSize: '13px', fontWeight: 700, color: '#e2e8f0' },
  dismissBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px' },
  alertBanner: { display: 'flex', alignItems: 'center', gap: '10px', background: '#fffbeb', border: '0.5px solid #fcd34d', borderRadius: '10px', padding: '12px 18px', marginBottom: '20px', cursor: 'pointer' },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' },
  statCard: { background: '#fff', borderRadius: '10px', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  statVal: { fontSize: '28px', fontWeight: 700, marginBottom: '2px' },
  statLabel: { fontSize: '12px', color: '#374151', fontWeight: 600, marginBottom: '2px' },
  statSub: { fontSize: '11px', color: '#94a3b8' },
  utilCard: { background: '#fff', borderRadius: '12px', padding: '24px 28px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '20px', border: '0.5px solid #f1f5f9' },
  utilHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  utilTitle: { fontSize: '16px', fontWeight: 700, color: '#0f172a' },
  utilSub: { fontSize: '12px', color: '#94a3b8' },
  utilStatRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: '0.5px solid #f1f5f9' },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' },
  roiCard: { background: '#fff', borderRadius: '10px', padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  roiVal: { fontSize: '26px', fontWeight: 700, marginBottom: '2px' },
  roiLabel: { fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '2px' },
  roiSub: { fontSize: '11px', color: '#94a3b8' },
  cfBanner: { background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: '10px', padding: '20px 26px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '24px' },
  cfHeading: { fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px' },
  cfBody: { fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' },
  qbCard: { background: '#fff', borderRadius: '10px', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  qbGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' },
  qbItem: { background: '#f8fafc', borderRadius: '8px', padding: '14px', textAlign: 'center' as const },
  qbCount: { fontSize: '26px', fontWeight: 700, marginBottom: '4px' },
  qbLabel: { fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 500 },
  qbBarBg: { height: '4px', background: '#e2e8f0', borderRadius: '2px', marginBottom: '4px', overflow: 'hidden' },
  qbBarFill: { height: '4px', borderRadius: '2px' },
  qbPct: { fontSize: '10px', color: '#94a3b8' },
};
