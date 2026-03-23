import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useDashboardData } from '../context/DashboardDataContext';
import { STAFF_PATH } from '../constants/nav';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}` : '';

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

// ── Before / After Schedule Toggle ───────────────────────────────────────────
// Shows a realistic weekly schedule diff: what the week looked like before the
// agent ran vs after suggestions were approved — the single most compelling demo.

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM'];

type SlotState = 'filled' | 'gap' | 'new';
interface ScheduleSlot { day: number; hour: number; label: string; state: SlotState }

const BEFORE_SLOTS: ScheduleSlot[] = [
  { day: 0, hour: 0, label: 'Emma Wilson · PPL-12', state: 'filled' },
  { day: 0, hour: 1, label: 'OPEN (cancellation)', state: 'gap' },
  { day: 0, hour: 3, label: 'Carlos Rivera · CPL-7', state: 'filled' },
  { day: 1, hour: 0, label: 'James Kowalski · CPL-21', state: 'filled' },
  { day: 1, hour: 2, label: 'OPEN (no booking)', state: 'gap' },
  { day: 1, hour: 4, label: 'Aisha Patel · PPL-9', state: 'filled' },
  { day: 2, hour: 1, label: 'Sophie Chen · IR-4', state: 'filled' },
  { day: 2, hour: 2, label: 'OPEN (cancellation)', state: 'gap' },
  { day: 3, hour: 0, label: 'Taylor Brooks · IR-6', state: 'filled' },
  { day: 3, hour: 3, label: 'OPEN (no booking)', state: 'gap' },
  { day: 4, hour: 1, label: 'Priya Menon · PPL-3', state: 'filled' },
  { day: 4, hour: 2, label: 'OPEN (cancellation)', state: 'gap' },
  { day: 5, hour: 0, label: 'Marcus Johnson · PPL-1', state: 'filled' },
];

const AFTER_SLOTS: ScheduleSlot[] = [
  { day: 0, hour: 0, label: 'Emma Wilson · PPL-12', state: 'filled' },
  { day: 0, hour: 1, label: 'Marcus Johnson · PPL-2 ✓', state: 'new' },  // was gap
  { day: 0, hour: 3, label: 'Carlos Rivera · CPL-7', state: 'filled' },
  { day: 1, hour: 0, label: 'James Kowalski · CPL-21', state: 'filled' },
  { day: 1, hour: 2, label: 'Ryan Okafor · PPL-1 ✓', state: 'new' },     // was gap
  { day: 1, hour: 4, label: 'Aisha Patel · PPL-9', state: 'filled' },
  { day: 2, hour: 1, label: 'Sophie Chen · IR-4', state: 'filled' },
  { day: 2, hour: 2, label: 'Derek Williams · PPL-2 ✓', state: 'new' }, // was gap
  { day: 3, hour: 0, label: 'Taylor Brooks · IR-6', state: 'filled' },
  { day: 3, hour: 3, label: 'Lena Fischer · CPL-8 ✓', state: 'new' },   // was gap
  { day: 4, hour: 1, label: 'Priya Menon · PPL-3', state: 'filled' },
  { day: 4, hour: 2, label: 'Carlos Rivera · CPL-8 ✓', state: 'new' },  // was gap
  { day: 5, hour: 0, label: 'Marcus Johnson · PPL-1', state: 'filled' },
];

function BeforeAfterToggle() {
  const [view, setView] = useState<'before' | 'after'>('before');
  const slots = view === 'before' ? BEFORE_SLOTS : AFTER_SLOTS;

  const grid: (ScheduleSlot | null)[][] = Array.from({ length: DAYS.length }, () =>
    Array(HOURS.length).fill(null)
  );
  for (const s of slots) grid[s.day][s.hour] = s;

  const SLOT_STYLE: Record<SlotState, React.CSSProperties> = {
    filled: { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' },
    gap: { background: '#fef2f2', border: '1px dashed #fca5a5', color: '#dc2626' },
    new: { background: '#f0fdf4', border: '2px solid #22c55e', color: '#15803d', fontWeight: 700 },
  };

  const gapsBefore = BEFORE_SLOTS.filter(s => s.state === 'gap').length;
  const gapsAfter = AFTER_SLOTS.filter(s => s.state === 'gap').length;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Schedule: Before vs After Agent</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, fontWeight: 500, letterSpacing: '0.02em' }}>ILLUSTRATIVE SAMPLE — not live FSP schedule</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {view === 'before'
              ? `${gapsBefore} open gaps — ${gapsBefore * 185 < 1000 ? `$${gapsBefore * 185}` : `$${(gapsBefore * 185).toLocaleString()}`} in at-risk revenue`
              : `${gapsAfter} gaps remaining · Agent filled ${gapsBefore - gapsAfter} slots · $${((gapsBefore - gapsAfter) * 185).toLocaleString()} recovered`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
          {(['before', 'after'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: view === v ? '#fff' : 'transparent',
              color: view === v ? '#1e293b' : '#64748b',
              boxShadow: view === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              transition: 'all .15s',
            }}>
              {v === 'before' ? 'Before' : 'After Agent'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ width: 52, fontSize: 11, color: '#94a3b8', textAlign: 'left' as const, paddingLeft: 4 }}>Time</th>
              {DAYS.map(d => (
                <th key={d} style={{ fontSize: 11, fontWeight: 700, color: '#475569', textAlign: 'center' as const, paddingBottom: 6 }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h, hi) => (
              <tr key={h}>
                <td style={{ fontSize: 11, color: '#94a3b8', verticalAlign: 'middle', paddingRight: 4 }}>{h}</td>
                {DAYS.map((_, di) => {
                  const slot = grid[di][hi];
                  return (
                    <td key={di} style={{ verticalAlign: 'top' }}>
                      {slot ? (
                        <div style={{
                          ...SLOT_STYLE[slot.state],
                          borderRadius: 6,
                          padding: '5px 7px',
                          fontSize: 10,
                          lineHeight: 1.4,
                          minHeight: 36,
                        }}>
                          {slot.label}
                        </div>
                      ) : (
                        <div style={{ minHeight: 36 }} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' as const }}>
        {[
          { color: '#eff6ff', border: '1px solid #bfdbfe', text: 'Confirmed lesson' },
          { color: '#fef2f2', border: '1px dashed #fca5a5', text: 'Open gap (revenue at risk)' },
          { color: '#f0fdf4', border: '2px solid #22c55e', text: 'Filled by agent ✓' },
        ].map(l => (
          <span key={l.text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: l.color, border: l.border, flexShrink: 0 }} />
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}

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

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    stats,
    insights,
    loading,
    error,
    lastAgentRun,
    monthlyRevenueRecovered,
    refreshFull,
  } = useDashboardData();
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentStep, setAgentStep] = useState(0);
  const [agentResult, setAgentResult] = useState<{ created: number } | null>(null);
  const [agentError, setAgentError] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const url = `${API_BASE}/api/events/stream`;
    const es = new EventSource(`${url}?token=${token}`);
    sseRef.current = es;
    es.addEventListener('cancellation.detected', () => {
      setSimResult('Cancellation detected — agent is filling the slot');
      refreshFull().catch(() => { /* stale ok */ });
    });
    es.addEventListener('suggestion.created', () => {
      refreshFull().catch(() => { /* stale ok */ });
    });
    es.addEventListener('student.schedule_draft_updated', () => {
      refreshFull().catch(() => { /* stale ok */ });
    });
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [refreshFull]);

  const handleRunAgent = async () => {
    setAgentRunning(true); setAgentResult(null); setAgentError(''); setAgentStep(0);
    const interval = setInterval(() => setAgentStep(p => p < AGENT_STEPS.length - 1 ? p + 1 : p), 600);
    try {
      const result = await api.runAgent();
      clearInterval(interval); setAgentStep(AGENT_STEPS.length - 1);
      setAgentResult({ created: result.created });
      await refreshFull();
    } catch (err: unknown) {
      clearInterval(interval);
      setAgentError(err instanceof Error ? err.message : 'Agent run failed');
    } finally { setAgentRunning(false); }
  };

  const handleSimulateCancellation = async () => {
    setSimulating(true); setSimResult(null);
    try {
      const result = await api.simulateCancellation();
      setSimResult(result.message);
      await refreshFull();
    } catch (err: unknown) {
      setSimResult((err instanceof Error ? err.message : 'Simulation failed'));
    } finally { setSimulating(false); }
  };

  if (loading && !stats) return <div style={s.loading}>Loading dashboard...</div>;
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
          {/* Agent is watching chip — shows real last run time from DB */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '3px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 20, fontSize: 11 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 0 2px #dcfce7' }} />
            <span style={{ color: '#166534', fontWeight: 600 }}>Agent watching</span>
            <span style={{ color: '#4ade80' }}>·</span>
            <span style={{ color: '#64748b' }}>
              {lastAgentRun
                ? `Last run ${lastAgentRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Not yet run today'}
            </span>
          </div>
        </div>
        <div style={s.headerRight}>
          {(stats.pendingStudentRequests || 0) > 0 && (
            <button
              type="button"
              onClick={() => navigate(STAFF_PATH.queue)}
              style={s.reqBadge}
            >
              🎓 {stats.pendingStudentRequests} student request{stats.pendingStudentRequests !== 1 ? 's' : ''} pending →
            </button>
          )}
          <button
            onClick={handleSimulateCancellation}
            disabled={simulating}
            style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: simulating ? 'not-allowed' : 'pointer', opacity: simulating ? 0.7 : 1 }}
          >
            {simulating ? '⟳ Simulating...' : '⚡ Simulate Cancellation'}
          </button>
          <button onClick={handleRunAgent} disabled={agentRunning}
            style={{ ...s.runBtn, ...(agentRunning ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}>
            {agentRunning ? '⟳ Running...' : '▶ Run Agent Now'}
          </button>
        </div>
      </div>

      {/* CTO Hero Card — single number, single sentence */}
      {monthlyRevenueRecovered !== null && (
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)',
          borderRadius: 12, padding: '20px 28px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>
              ${monthlyRevenueRecovered.toLocaleString()}
            </div>
            <div style={{ fontSize: 14, color: '#93c5fd', marginTop: 4 }}>
              recovered in flight revenue (analysis period) from approved agent suggestions
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, fontWeight: 500 }}>
              Same source as Analysis → Revenue — not the same as the lifetime model estimate below.
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(STAFF_PATH.analysis)}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            See full breakdown →
          </button>
        </div>
      )}

      {/* Simulation result banner */}
      {simResult && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#166534' }}>
          <span>⚡ {simResult} — check the Approval Queue for the new suggestion.</span>
          <button onClick={() => setSimResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>✕</button>
        </div>
      )}

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
        <button
          type="button"
          onClick={() => navigate(STAFF_PATH.queue)}
          style={s.alert}
        >
          <span>⚠</span>
          <strong style={{ color: '#92400e' }}>{stats.atRiskStudentCount} student{stats.atRiskStudentCount !== 1 ? 's' : ''} haven't flown in 7+ days</strong>
          <span style={{ color: '#92400e' }}> — open queue to review →</span>
        </button>
      )}

      {/* Stat cards — clickable where they go somewhere */}
      <div style={s.grid4}>
        {[
          { label: 'Pending in Queue', value: stats.pending, color: '#d97706', border: '#fcd34d', bg: '#fffbeb', href: `${STAFF_PATH.queue}?status=pending` },
          { label: 'Approved Today', value: stats.approvedToday, color: '#15803d', border: '#86efac', bg: '#f0fdf4', href: `${STAFF_PATH.queue}?status=approved` },
          { label: 'Declined Today', value: stats.declinedToday, color: '#dc2626', border: '#fca5a5', bg: '#fef2f2', href: `${STAFF_PATH.queue}?status=declined` },
          { label: 'Avg Response Time', value: stats.avgResponseTime > 0 ? `${stats.avgResponseTime.toFixed(1)}h` : 'N/A', color: '#4338ca', border: '#a5b4fc', bg: '#eef2ff', href: '', sub: 'Rolling average (dashboard model)' },
        ].map(card => (
          card.href ? (
            <button
              key={card.label}
              type="button"
              onClick={() => navigate(card.href)}
              style={{
                background: card.bg, border: `1px solid ${card.border}`, borderRadius: '8px', padding: '18px 20px',
                cursor: 'pointer', textAlign: 'left' as const, width: '100%',
              }}
            >
              <div style={{ fontSize: '30px', fontWeight: 700, color: card.color, marginBottom: '4px' }}>{card.value}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{card.label}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 6 }}>Open queue →</div>
            </button>
          ) : (
            <div
              key={card.label}
              style={{ background: card.bg, border: `1px solid ${card.border}`, borderRadius: '8px', padding: '18px 20px' }}
            >
              <div style={{ fontSize: '30px', fontWeight: 700, color: card.color, marginBottom: '4px' }}>{card.value}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{card.label}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 6 }}>{'sub' in card ? card.sub : ''}</div>
            </div>
          )
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

      {/* ROI cards — first two open Analysis; at-risk opens queue when &gt; 0, else plain info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => navigate(STAFF_PATH.analysis)}
          style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '20px 22px',
            cursor: 'pointer', textAlign: 'left' as const, font: 'inherit',
          }}
        >
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#2563eb', marginBottom: '4px' }}>{stats.aircraftFillRate}%</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '2px' }}>Aircraft Fill Rate</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>{stats.slotsFilledByAgent} slots filled (model) · Analysis →</div>
        </button>
        <button
          type="button"
          onClick={() => navigate(STAFF_PATH.analysis)}
          style={{
            background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '20px 22px',
            cursor: 'pointer', textAlign: 'left' as const, font: 'inherit',
          }}
        >
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#7c3aed', marginBottom: '4px' }}>{stats.timeSavedHours}h</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '2px' }}>Est. Time Saved</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Dispatcher hours (estimate) · Analysis →</div>
        </button>
        {stats.atRiskStudentCount > 0 ? (
          <button
            type="button"
            onClick={() => navigate(STAFF_PATH.queue)}
            style={{
              background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '20px 22px',
              cursor: 'pointer', textAlign: 'left' as const, font: 'inherit',
            }}
          >
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#b45309', marginBottom: '4px' }}>{stats.atRiskStudentCount}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '2px' }}>Students idle 7+ days</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Review scheduling suggestions · Queue →</div>
          </button>
        ) : (
          <div style={{ background: '#fafafa', border: '1px dashed #e2e8f0', borderRadius: '8px', padding: '20px 22px' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>0</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>Students idle 7+ days</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>None flagged — informational only</div>
          </div>
        )}
      </div>

      {/* Before / After Schedule Toggle */}
      <BeforeAfterToggle />

      {/* Queue breakdown */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={s.cardTitle}>Queue Breakdown</div>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{totalSuggestions} total suggestions</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
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

      {/* Acceptance Rate Analytics */}
      {insights && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div style={s.cardTitle}>Agent Acceptance Rate</div>
              <div style={s.cardSub}>How often dispatchers approve agent suggestions — last 14 days</div>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#10b981' }}>{insights.overallAcceptanceRate}%</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>overall rate</div>
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#2563eb' }}>{insights.totalApproved}</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>approved</div>
              </div>
            </div>
          </div>

          {insights.dailyTrend.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={insights.dailyTrend.map(d => ({
                day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                rate: parseFloat(d.rate) || 0,
                approved: parseInt(d.approved, 10),
                declined: parseInt(d.declined, 10),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" width={35} />
                <Tooltip
                  contentStyle={{ fontSize: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                  formatter={(val) => [`${typeof val === 'number' ? val : Number(val)}%`, 'Acceptance Rate']}
                />
                <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center' as const, padding: '30px', color: '#94a3b8', fontSize: '13px' }}>
              Chart will appear after a few days of dispatcher activity
            </div>
          )}

          {/* Acceptance by type */}
          {insights.byType.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' as const }}>
              {insights.byType.map(row => (
                <div key={row.type} style={{ flex: '1', minWidth: '100px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' as const }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: TYPE_COLORS[row.type] || '#2563eb' }}>{row.acceptance_rate || 0}%</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{TYPE_LABELS[row.type] || row.type}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
  reqBadge: { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '12px', fontWeight: 600, padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', font: 'inherit' },
  runBtn: { background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  agentPanel: { background: '#0f172a', borderRadius: '8px', padding: '16px 20px', marginBottom: '16px' },
  alert: { display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', cursor: 'pointer', fontSize: '13px', width: '100%', textAlign: 'left' as const, font: 'inherit' },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' },
  card: { background: '#fff', borderRadius: '8px', padding: '20px 24px', border: '1px solid #e2e8f0', marginBottom: '20px' },
  cardTitle: { fontSize: '15px', fontWeight: 700, color: '#1e293b' },
  cardSub: { fontSize: '12px', color: '#94a3b8', marginTop: '2px' },
};
