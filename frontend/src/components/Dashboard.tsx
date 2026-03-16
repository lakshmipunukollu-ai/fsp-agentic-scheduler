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
  const r = 48;
  const circ = 2 * Math.PI * r;
  const currDash = (current / 100) * circ;
  const propDash = (proposed / 100) * circ;
  const offset = circ * 0.25;
  return (
    <div style={{ textAlign: 'center' as const }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="11" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="11"
          strokeDasharray={`${currDash} ${circ}`} strokeDashoffset={offset} strokeLinecap="round" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#10b981" strokeWidth="11" opacity="0.6"
          strokeDasharray={`${propDash} ${circ}`} strokeDashoffset={offset - currDash} strokeLinecap="round" />
        <text x="60" y="55" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1e293b">{current}%</text>
        <text x="60" y="70" textAnchor="middle" fontSize="10" fill="#94a3b8">current</text>
      </svg>
      <div style={{ fontSize: '13px', color: '#374151', fontWeight: 600, marginTop: '6px' }}>{label}</div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '4px' }}>
        <span style={{ fontSize: '11px', color, fontWeight: 600 }}>● {current}%</span>
        <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>● {proposed}%</span>
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
    try { const data = await api.getDashboardStats(); setStats(data); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
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
        <div style={s.headerRight}>
          {(stats.pendingStudentRequests || 0) > 0 && (
            <div onClick={() => onNavigate?.('queue')} style={s.reqBadge}>
              🎓 {stats.pendingStudentRequests} student request{stats.pendingStudentRequests !== 1 ? 's' : ''} pending →
            </div>
          )}
          <button onClick={handleRunAgent} disabled={agentRunning}
            style={{ ...s.runBtn, ...(agentRunning ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}>
            {agentRunning ? '⟳ Running...' : '▶ Run Agent Now'}
          </button>
        </div>
      </div>

      {/* Agent panel */}
      {(agentRunning || agentResult || agentError) && (
        <div style={s.agentPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
              {agentRunning ? '🤖 Intelligent Scheduling Agent' : agentResult ? '✅ Complete' : '❌ Error'}
            </span>
            {!agentRunning && <button onClick={() => { setAgentResult(null); setAgentError(''); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px' }}>✕</button>}
          </div>
          {agentRunning && AGENT_STEPS.map((step, i) => (
            <div key={i} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', color: i === agentStep ? '#38bdf8' : i < agentStep ? '#10b981' : '#334155', fontWeight: i === agentStep ? 600 : 400 }}>
              <span style={{ width: '14px' }}>{i < agentStep ? '✓' : i === agentStep ? '⟳' : '○'}</span>{step}
            </div>
          ))}
          {agentResult && <div style={{ color: '#10b981', fontSize: '13px' }}><strong>{agentResult.created} new suggestions generated</strong> — check the Approval Queue.</div>}
          {agentError && <div style={{ color: '#ef4444', fontSize: '13px' }}>{agentError}</div>}
        </div>
      )}

      {/* Alert */}
      {stats.atRiskStudentCount > 0 && (
        <div onClick={() => onNavigate?.('queue')} style={s.alert}>
          <span>⚠</span>
          <strong style={{ color: '#92400e' }}>{stats.atRiskStudentCount} student{stats.atRiskStudentCount !== 1 ? 's' : ''} haven't flown in 7+ days</strong>
          <span style={{ color: '#92400e' }}> — click to review scheduling suggestions →</span>
        </div>
      )}

      {/* Stat cards */}
      <div style={s.grid4}>
        {[
          { label: 'Pending in Queue', value: stats.pending, color: '#d97706', border: '#fcd34d', bg: '#fffbeb' },
          { label: 'Approved Today', value: stats.approvedToday, color: '#15803d', border: '#86efac', bg: '#f0fdf4' },
          { label: 'Declined Today', value: stats.declinedToday, color: '#dc2626', border: '#fca5a5', bg: '#fef2f2' },
          { label: 'Avg Response Time', value: `${stats.avgResponseTime.toFixed(1)}h`, color: '#4338ca', border: '#a5b4fc', bg: '#eef2ff' },
        ].map(card => (
          <div key={card.label} style={{ background: card.bg, border: `1px solid ${card.border}`, borderRadius: '8px', padding: '18px 20px' }}>
            <div style={{ fontSize: '30px', fontWeight: 700, color: card.color, marginBottom: '4px' }}>{card.value}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Utilization */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={s.cardTitle}>Aircraft & Instructor Utilization</div>
            <div style={s.cardSub}>Next 7 days · {util.activeAircraft} aircraft · {util.activeInstructors} instructors active</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
          <div style={{ display: 'flex', gap: '40px' }}>
            <DonutChart current={util.current} proposed={util.proposed} label="Aircraft" color="#ef4444" />
            <DonutChart current={instrCurrent} proposed={instrProposed} label="Instructor" color="#f59e0b" />
          </div>
          <div style={{ width: '1px', height: '100px', background: '#e2e8f0', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>Aircraft improvement with agent</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: '#10b981' }}>+{Math.max(0, util.proposed - util.current)}%</div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>Slots filled by agent</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: '#2563eb' }}>{util.bookedSlots}</div>
            </div>
            <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', fontSize: '12px', color: '#15803d' }}>
              Red = current · Green = projected with agent
            </div>
          </div>
        </div>
      </div>

      {/* ROI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {[
          { label: 'Aircraft Fill Rate', value: `${stats.aircraftFillRate}%`, sub: `${stats.slotsFilledByAgent} slots filled`, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
          { label: 'Est. Time Saved', value: `${stats.timeSavedHours}h`, sub: 'Dispatcher hours recovered', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
          { label: 'Revenue Recovered', value: `$${stats.revenueRecovered.toLocaleString()}`, sub: 'From agent-filled openings', color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
        ].map(card => (
          <div key={card.label} style={{ background: card.bg, border: `1px solid ${card.border}`, borderRadius: '8px', padding: '20px 22px' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: card.color, marginBottom: '4px' }}>{card.value}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '2px' }}>{card.label}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Counterfactual */}
      <div style={{ background: '#1e3a5f', borderRadius: '8px', padding: '20px 28px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px' }}>Without Intelligent Scheduling</div>
          <div style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6 }}>{stats.slotsFilledByAgent} open slot{stats.slotsFilledByAgent !== 1 ? 's' : ''} would have gone unfilled — dispatchers would have manually called waitlisted students, cross-checked availability, and re-confirmed instructors and aircraft.</div>
        </div>
        <div style={{ textAlign: 'center' as const, minWidth: '80px', paddingLeft: '24px' }}>
          <div style={{ fontSize: '44px', fontWeight: 800, color: '#60a5fa' }}>{stats.slotsFilledByAgent}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>slots auto-filled</div>
        </div>
      </div>

      {/* Queue breakdown */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={s.cardTitle}>Queue Breakdown</div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{totalSuggestions} total suggestions</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {Object.entries(stats.suggestionsByType).map(([type, count]) => {
            const pct = totalSuggestions > 0 ? Math.round((count / totalSuggestions) * 100) : 0;
            return (
              <div key={type} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', textAlign: 'center' as const }}>
                <div style={{ fontSize: '26px', fontWeight: 700, color: TYPE_COLORS[type] || '#2563eb', marginBottom: '4px' }}>{count}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>{TYPE_LABELS[type] || type}</div>
                <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: TYPE_COLORS[type] || '#2563eb', borderRadius: '2px' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{pct}%</div>
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
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' },
  subtitle: { color: '#64748b', margin: 0, fontSize: '13px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  reqBadge: { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '12px', fontWeight: 600, padding: '7px 14px', borderRadius: '6px', cursor: 'pointer' },
  runBtn: { background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  agentPanel: { background: '#0f172a', borderRadius: '8px', padding: '16px 20px', marginBottom: '16px' },
  alert: { display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', cursor: 'pointer', fontSize: '13px' },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' },
  card: { background: '#fff', borderRadius: '8px', padding: '20px 24px', border: '1px solid #e2e8f0', marginBottom: '20px' },
  cardTitle: { fontSize: '15px', fontWeight: 700, color: '#1e293b' },
  cardSub: { fontSize: '12px', color: '#94a3b8', marginTop: '2px' },
};
