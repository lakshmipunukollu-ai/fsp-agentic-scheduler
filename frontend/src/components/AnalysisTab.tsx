import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { api } from '../api/client';
import { useDashboardData } from '../context/DashboardDataContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type SchoolType = 'part_141' | 'part_61';

interface GradStudent {
  user_id: string; name: string; email: string; license_type: string;
  hours_logged: number; hours_required: number;
  flights_last_30_days: number; last_flight_date: string | null;
  days_since_last_flight: number; flights_per_week: number;
  projected_graduation_hours: number; extra_hours: number;
  extra_cost_usd: number; risk_level: 'green' | 'yellow' | 'red';
}

interface AtRiskStudent {
  user_id: string; name: string; email: string; license_type: string;
  hours_logged: number; hours_required: number;
  flights_last_30_days: number; last_flight_date: string | null;
  days_since_last_flight: number;
}

interface LeaderboardStudent {
  rank: number; name: string; license_type: string;
  hours_logged: number; hours_required: number;
  flights_last_30_days: number; flights_per_week: number;
  last_flight_date: string | null; pace_status: 'on_track' | 'behind' | 'at_risk';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_COLORS = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444' };
const PACE_LABELS: Record<string, string> = { on_track: 'On Track', behind: 'Behind', at_risk: 'At Risk' };
const PACE_COLORS: Record<string, string> = { on_track: '#22c55e', behind: '#f59e0b', at_risk: '#ef4444' };

function fmt(n: number) { return `$${n.toLocaleString()}`; }
function pct(n: number) { return `${Math.round(n)}%`; }

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, color: '#fff', background: color,
    }}>{label}</span>
  );
}

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${accent || '#e2e8f0'}`,
      borderRadius: 12, padding: '20px 24px', marginBottom: 24,
      borderLeft: accent ? `4px solid ${accent}` : undefined,
    }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{title}</h3>
      {children}
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || '#1e293b' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Section: School Type Toggle ─────────────────────────────────────────────

function SchoolTypeToggle({ schoolType, onToggle }: { schoolType: SchoolType; onToggle: (t: SchoolType) => void }) {
  const [saving, setSaving] = useState(false);

  const toggle = async (t: SchoolType) => {
    setSaving(true);
    try { await api.setSchoolType(t); onToggle(t); } catch { /* silent */ } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>School Mode:</span>
      {(['part_141', 'part_61'] as SchoolType[]).map(t => (
        <button
          key={t}
          onClick={() => toggle(t)}
          disabled={saving}
          style={{
            padding: '6px 16px', borderRadius: 8, border: '2px solid',
            borderColor: schoolType === t ? '#3b82f6' : '#e2e8f0',
            background: schoolType === t ? '#3b82f6' : '#f8fafc',
            color: schoolType === t ? '#fff' : '#475569',
            fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {t === 'part_141' ? 'Part 141 — Full Syllabus' : 'Part 61 — Frequency Mode'}
        </button>
      ))}
      {schoolType === 'part_61' && (
        <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>
          Part 61 mode: agent tracks frequency + last flight date only
        </span>
      )}
    </div>
  );
}

// ─── Section: Agent Narrative ─────────────────────────────────────────────────

function AgentNarrative() {
  const [data, setData] = useState<{ narrative: string; cached?: boolean; stats: { openings_evaluated?: number; suggestions_created: number; approved: number; declined: number; pending: number; revenue_recovered_usd: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    setErrorDetail(null);
    api
      .getAgentNarrative()
      .then(setData)
      .catch((e: unknown) => {
        setError(true);
        const msg = e instanceof Error ? e.message : 'Request failed';
        setErrorDetail(
          import.meta.env.DEV
            ? `${msg} · Ensure the backend is running (Vite proxies /api to http://localhost:3001).`
            : msg,
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <SectionError name="Agent Narrative" onRetry={load} detail={errorDetail ?? undefined} />;

  return (
    <Card title="What did the agent do today?" accent="#3b82f6">
      {loading ? (
        <Skeleton height={80} />
      ) : data ? (
        <>
          <p style={{ margin: '0 0 16px', fontSize: 15, color: '#334155', lineHeight: 1.7, fontStyle: 'italic' }}>
            "{data.narrative}"
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
            {data.stats.openings_evaluated !== undefined && (
              <Stat label="Openings Evaluated" value={data.stats.openings_evaluated} color="#64748b" />
            )}
            <Stat label="Suggestions Created" value={data.stats.suggestions_created} />
            <Stat label="Approved" value={data.stats.approved} color="#22c55e" />
            <Stat label="Declined" value={data.stats.declined} color="#ef4444" />
            <Stat label="Pending" value={data.stats.pending} color="#f59e0b" />
            <Stat label="Revenue Recovered" value={fmt(data.stats.revenue_recovered_usd)} color="#3b82f6" />
          </div>
          {data.cached && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Cached — refreshes every hour</div>
          )}
        </>
      ) : (
        <p style={{ color: '#94a3b8', fontSize: 14 }}>No activity data available yet.</p>
      )}
    </Card>
  );
}

// ─── Section: Revenue Breakdown ───────────────────────────────────────────────

const MONTHLY_GOAL_USD = 5000; // configurable — matches a realistic school target

function RevenueGoalWidget({ recovered }: { recovered: number }) {
  const pct = Math.min(100, Math.round((recovered / MONTHLY_GOAL_USD) * 100));
  const remaining = Math.max(0, MONTHLY_GOAL_USD - recovered);
  const barColor = pct >= 80 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)',
      borderRadius: 12, padding: '20px 24px', marginBottom: 20,
      color: '#fff',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, color: '#93c5fd', marginBottom: 4 }}>Monthly Recovery Goal</div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em' }}>{fmt(recovered)}</div>
          <div style={{ fontSize: 13, color: '#93c5fd', marginTop: 2 }}>recovered of {fmt(MONTHLY_GOAL_USD)} target this month</div>
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: barColor }}>{pct}%</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>of goal</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
        <span>{pct >= 100 ? '🎯 Goal reached!' : `${fmt(remaining)} still to recover`}</span>
        <span>Goal: {fmt(MONTHLY_GOAL_USD)}/month</span>
      </div>
    </div>
  );
}

function RevenueBreakdown() {
  const [data, setData] = useState<{
    opportunity_found_usd: number; revenue_recovered_usd: number;
    revenue_at_risk_usd: number; revenue_lost_cancellations_usd: number;
    projected_loss_at_risk_students_usd: number; avg_lesson_price_usd: number; period_days: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    api.getRevenueBreakdown().then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <SectionError name="Revenue Breakdown" onRetry={load} />;

  if (loading) return <><Skeleton height={100} /><Card title="Revenue Breakdown — Last 30 Days"><Skeleton height={200} /></Card></>;
  if (!data) return null;

  const items = [
    { label: 'Total opportunity surfaced by agent', value: data.opportunity_found_usd, color: '#3b82f6', note: `Count of suggestions × $${data.avg_lesson_price_usd} avg lesson price` },
    { label: 'Revenue recovered', value: data.revenue_recovered_usd, color: '#22c55e', note: 'Approved suggestions — slots confirmed in FSP' },
    { label: 'Revenue at risk', value: data.revenue_at_risk_usd, color: '#f59e0b', note: 'Pending suggestions — waiting for dispatcher approval' },
    { label: 'Lost to unfilled cancellations', value: data.revenue_lost_cancellations_usd, color: '#ef4444', note: 'Cancelled slots the agent could not recover' },
    { label: 'Projected extra cost from at-risk students', value: data.projected_loss_at_risk_students_usd, color: '#8b5cf6', note: `Extra flight hours × $${data.avg_lesson_price_usd}/hr at current pace vs 40-hr minimum` },
  ];

  return (
    <>
      <RevenueGoalWidget recovered={data.revenue_recovered_usd} />
      <Card title="Revenue Breakdown — Last 30 Days" accent="#22c55e">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          {items.map(item => (
            <div key={item.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: '#f8fafc', borderRadius: 8,
              borderLeft: `3px solid ${item.color}`,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{item.label}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.note}</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{fmt(item.value)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
          Avg lesson price: {fmt(data.avg_lesson_price_usd)} — configurable in Policy Settings
        </div>
      </Card>
    </>
  );
}

// ─── Section: Cancellation Impact ────────────────────────────────────────────

function CancellationImpact() {
  const [data, setData] = useState<{
    total_cancellations: number; filled_by_agent: number; recovery_rate_pct: number;
    revenue_recovered_usd: number; revenue_still_at_risk_usd: number;
    without_agent: { recovery_rate_pct: number; revenue_recovered_usd: number };
    with_agent: { recovery_rate_pct: number; revenue_recovered_usd: number; avg_fill_time_hours: number | null };
  } | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true); setError(false);
    api.getCancellationStats().then(setData).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const simulate = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      const result = await api.simulateCancellation();
      setSimResult(result.message);
      loadData();
    } catch (e: unknown) {
      setSimResult((e as Error).message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  if (error) return <SectionError name="Cancellation Impact" onRetry={loadData} />;

  return (
    <Card title="Cancellation Recovery — Agent vs Manual" accent="#ef4444">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          Pilot Base currently has <strong>no automated cancellation handling</strong>. This shows what the agent recovers.
        </div>
        <button
          onClick={simulate}
          disabled={simulating}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: simulating ? '#94a3b8' : '#ef4444',
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: simulating ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {simulating ? 'Simulating...' : '⚡ Simulate Cancellation'}
        </button>
      </div>

      {simResult && (
        <div style={{
          padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac',
          borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#166534',
        }}>
          {simResult} — check the Approval Queue for the new suggestion.
        </div>
      )}

      {loading ? <div style={{ color: '#94a3b8' }}>Loading...</div> : data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Without agent */}
            <div style={{ padding: 16, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                Without Agent
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#dc2626' }}>{pct(data.without_agent.recovery_rate_pct)}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>recovery rate</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', marginTop: 8 }}>
                {fmt(data.without_agent.revenue_recovered_usd)}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>recovered</div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Manual: staff must find + contact students</div>
            </div>

            {/* With agent */}
            <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 10, border: '1px solid #86efac' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                With Agent
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#16a34a' }}>{pct(data.with_agent.recovery_rate_pct)}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>recovery rate</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginTop: 8 }}>
                {fmt(data.with_agent.revenue_recovered_usd)}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>recovered</div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                Avg fill time: {data.with_agent.avg_fill_time_hours != null ? `${data.with_agent.avg_fill_time_hours * 60} min` : 'N/A'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Stat label="Total Cancellations" value={data.total_cancellations} />
            <Stat label="Filled by Agent" value={data.filled_by_agent} color="#22c55e" />
            <Stat label="Still At Risk" value={fmt(data.revenue_still_at_risk_usd)} color="#ef4444" />
          </div>
        </>
      ) : (
        <p style={{ color: '#94a3b8' }}>No cancellation data yet — try the simulation.</p>
      )}
    </Card>
  );
}

// ─── Section: Graduation Risk Table ──────────────────────────────────────────

function GraduationRiskTable() {
  const [students, setStudents] = useState<GradStudent[]>([]);
  const [avgPrice, setAvgPrice] = useState(185);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<{ key: keyof GradStudent; dir: 1 | -1 }>({ key: 'risk_level', dir: 1 });

  const load = useCallback(() => {
    setLoading(true); setError(false);
    api.getGraduationRisk()
      .then(d => { setStudents(d.data); setAvgPrice(d.avg_lesson_price_usd); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const sorted = [...students].sort((a, b) => {
    const riskOrder = { red: 0, yellow: 1, green: 2 };
    if (sort.key === 'risk_level') {
      return (riskOrder[a.risk_level] - riskOrder[b.risk_level]) * sort.dir;
    }
    const av = a[sort.key] as number, bv = b[sort.key] as number;
    return (av - bv) * sort.dir;
  });

  const cols: Array<{ key: keyof GradStudent; label: string; render?: (s: GradStudent) => React.ReactNode }> = [
    { key: 'name', label: 'Student', render: s => <span style={{ fontWeight: 600 }}>{s.name}</span> },
    { key: 'license_type', label: 'License' },
    { key: 'hours_logged', label: 'Hours Logged', render: s => `${s.hours_logged}h / ${s.hours_required}h` },
    { key: 'flights_per_week', label: 'Pace', render: s => `${s.flights_per_week}x/wk` },
    { key: 'projected_graduation_hours', label: 'Projected Grad', render: s => `${s.projected_graduation_hours}h` },
    { key: 'extra_cost_usd', label: 'Extra Cost', render: s => s.extra_cost_usd > 0 ? <span style={{ color: '#ef4444', fontWeight: 700 }}>{fmt(s.extra_cost_usd)}</span> : <span style={{ color: '#22c55e' }}>On track</span> },
    { key: 'days_since_last_flight', label: 'Last Flight', render: s => s.days_since_last_flight > 900 ? 'Never' : `${s.days_since_last_flight}d ago` },
    { key: 'risk_level', label: 'Risk', render: s => <Badge color={RISK_COLORS[s.risk_level]} label={s.risk_level.toUpperCase()} /> },
  ];

  if (error) return <SectionError name="Graduation Risk Table" onRetry={load} />;

  return (
    <Card title="Graduation Risk Table" accent="#f59e0b">
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        Students flying 3x/week graduate near the 40-hour minimum. Slower pace adds hours — and cost — directly to the student. Avg lesson price: {fmt(avgPrice)}.
      </div>
      {loading ? <Skeleton height={180} /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {cols.map(col => (
                  <th
                    key={String(col.key)}
                    onClick={() => setSort(s => ({ key: col.key, dir: s.key === col.key ? (-s.dir as 1 | -1) : 1 }))}
                    style={{
                      padding: '8px 12px', textAlign: 'left', background: '#f8fafc',
                      borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700,
                      cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label} {sort.key === col.key ? (sort.dir === 1 ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr key={s.user_id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  {cols.map(col => (
                    <td key={String(col.key)} style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      {col.render ? col.render(s) : String(s[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Section: Constraint Solver vs Agentic ───────────────────────────────────

function ConstraintSolverComparison() {
  const rows = [
    {
      issue: 'Hard to configure',
      solver: 'Requires extensive setup before running — most schools never get it working',
      agent: 'Zero config required — starts suggesting from day 1 based on available data',
    },
    {
      issue: 'Single-shot execution',
      solver: 'If it can\'t solve the full schedule, it stops — no partial results, no retry',
      agent: 'Retries with next-best candidates automatically — always returns actionable suggestions',
    },
    {
      issue: 'Opaque decisions',
      solver: 'Output is a schedule with no explanation — staff don\'t know why students were picked',
      agent: 'Every suggestion includes trigger, scores, constraints evaluated, and confidence level',
    },
    {
      issue: 'No cancellation handling',
      solver: 'When a student cancels, nothing happens — slot is lost',
      agent: 'Agent monitors cancellations in real time and surfaces waitlist candidates automatically',
    },
    {
      issue: 'No human review step',
      solver: 'Decisions are applied directly — no approval workflow, no audit trail',
      agent: 'All suggestions require dispatcher approval — immutable audit log on every action',
    },
  ];

  return (
    <Card title="Constraint Solver vs Agentic Scheduling" accent="#8b5cf6">
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        The current "Intelligent Scheduling Beta" in Pilot Base is a constraint solver — useful but brittle. Here's how the agentic approach addresses each limitation directly.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Issue', 'Constraint Solver', 'Agentic Scheduler'].map(h => (
              <th key={h} style={{
                padding: '8px 12px', textAlign: 'left', background: '#f8fafc',
                borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
                {row.issue}
              </td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#dc2626' }}>
                ✗ {row.solver}
              </td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#16a34a' }}>
                ✓ {row.agent}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Section: Frequency Nudge Feed ───────────────────────────────────────────

function FrequencyNudgeFeed() {
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [nudging, setNudging] = useState<Record<string, boolean>>({});
  const [nudged, setNudged] = useState<Record<string, boolean>>({});
  const [bulkNudging, setBulkNudging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    api.getAtRiskStudents()
      .then(d => setStudents(d.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const nudge = async (s: AtRiskStudent) => {
    setNudging(prev => ({ ...prev, [s.user_id]: true }));
    try {
      await api.nudgeStudent({
        userId: s.user_id,
        studentName: s.name,
        licenseType: s.license_type,
        daysSinceLastFlight: s.days_since_last_flight,
        hoursLogged: s.hours_logged,
      });
      setNudged(prev => ({ ...prev, [s.user_id]: true }));
    } catch { /* silent */ } finally {
      setNudging(prev => ({ ...prev, [s.user_id]: false }));
    }
  };

  const pendingCount = students.filter(s => !nudged[s.user_id]).length;

  const nudgeAllPending = async () => {
    const targets = students.filter(s => !nudged[s.user_id]);
    if (targets.length === 0) return;
    setBulkNudging(true);
    try {
      for (const s of targets) {
        await nudge(s);
      }
    } finally {
      setBulkNudging(false);
    }
  };

  if (error) return <SectionError name="Frequency Nudge Feed" onRetry={load} />;

  return (
    <Card title="Frequency Nudge Feed — Students Idle 7+ Days" accent="#f59e0b">
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 1.55 }}>
        Students who haven&apos;t flown recently. Each action calls the API to create an{' '}
        <strong style={{ color: '#475569' }}>at-risk nudge suggestion</strong> (same type the agent uses). Those items land in the{' '}
        <strong style={{ color: '#475569' }}>Approval Queue</strong> for dispatchers to approve or decline — they are not direct messages to students.
      </div>
      {loading ? <Skeleton height={120} /> : students.length === 0 ? (
        <div style={{ color: '#22c55e', fontSize: 14, padding: '12px 0' }}>All students are flying regularly.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap' as const,
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 12px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
          }}>
            <span style={{ fontSize: 13, color: '#78350f', fontWeight: 600 }}>
              {pendingCount > 0
                ? `${pendingCount} student${pendingCount === 1 ? '' : 's'} still need a nudge this session.`
                : 'Everyone in this list already has a nudge queued from this session.'}
            </span>
            <button
              type="button"
              onClick={() => void nudgeAllPending()}
              disabled={bulkNudging || pendingCount === 0}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: bulkNudging || pendingCount === 0 ? '#cbd5e1' : '#ea580c',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
                cursor: bulkNudging || pendingCount === 0 ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap' as const,
              }}
            >
              {bulkNudging ? 'Generating…' : `⚡ Generate nudges for all (${pendingCount})`}
            </button>
          </div>
          {students.map(s => (
            <div key={s.user_id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8,
            }}>
              <div>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>{s.name}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8' }}>{s.license_type}</span>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Last flight: {s.days_since_last_flight > 900 ? 'never' : `${s.days_since_last_flight} days ago`}
                  {' · '}{s.flights_last_30_days} flights last 30 days
                  {' · '}{s.hours_logged}h logged
                </div>
              </div>
              <button
                onClick={() => nudge(s)}
                disabled={bulkNudging || nudging[s.user_id] || nudged[s.user_id]}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none',
                  background: nudged[s.user_id] ? '#22c55e' : '#f59e0b',
                  color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  minWidth: 120,
                }}
              >
                {nudged[s.user_id] ? '✓ Nudge Sent' : nudging[s.user_id] ? 'Sending...' : '⚡ Generate Nudge'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Section: Acceptance Rate Chart ──────────────────────────────────────────

function AcceptanceRateChart() {
  const { insights } = useDashboardData();
  const data = insights?.byConfidence ?? [];
  const loading = !insights;

  const chartData = data.map(d => ({
    name: d.confidence.charAt(0).toUpperCase() + d.confidence.slice(1),
    rate: Math.round(parseFloat(d.acceptance_rate)),
    approved: parseInt(d.approved, 10),
    declined: parseInt(d.declined, 10),
  }));

  return (
    <Card title="Acceptance Rate by Confidence Level" accent="#3b82f6">
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        Proves the scoring model works — dispatchers consistently accept high-confidence suggestions more often than low-confidence ones.
      </div>
      {loading ? <Skeleton height={200} /> : chartData.length === 0 ? (
        <div style={{ fontSize: 13, color: '#94a3b8', padding: '24px 0', textAlign: 'center' }}>No confidence breakdown yet.</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip formatter={(v) => [`${v}%`, 'Acceptance Rate']} />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.name === 'High' ? '#22c55e' : entry.name === 'Medium' ? '#f59e0b' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// ─── Section: Frequency Leaderboard ──────────────────────────────────────────

function FrequencyLeaderboard() {
  const [students, setStudents] = useState<LeaderboardStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    api.getFrequencyLeaderboard()
      .then(d => setStudents(d.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <SectionError name="Frequency Leaderboard" onRetry={load} />;

  return (
    <Card title="Flight Frequency Leaderboard" accent="#22c55e">
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        Frequency is the #1 predictor of graduation success. Students flying 3x/week hit the 40-hour minimum; students flying 1–2x/month can end up at 60–80 hours.
      </div>
      {loading ? <Skeleton height={160} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {students.map(s => (
            <div key={s.rank} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', background: '#f8fafc', borderRadius: 8,
              border: `1px solid ${PACE_COLORS[s.pace_status]}22`,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: PACE_COLORS[s.pace_status],
                color: '#fff', fontWeight: 900, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{s.rank}</div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, color: '#1e293b' }}>{s.name}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8' }}>{s.license_type}</span>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {s.flights_last_30_days} flights last 30 days · {s.flights_per_week}x/week · {s.hours_logged}h / {s.hours_required}h
                </div>
              </div>
              <Badge color={PACE_COLORS[s.pace_status]} label={PACE_LABELS[s.pace_status]} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Section: Agent Retry Visibility ─────────────────────────────────────────

function AgentRetryVisibility() {
  const [suggestions, setSuggestions] = useState<Array<{
    id: string; type: string; payload: { studentName?: string };
    rationale: { trigger?: string; candidateScore?: unknown[]; confidence?: string };
    candidates_tried: number; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSuggestions({ limit: 20 })
      .then(d => {
        const s = (d.data as typeof suggestions).filter(x => (x.candidates_tried || 0) > 1);
        setSuggestions(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card title="Agent Retry Visibility">
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        Unlike the constraint solver which stops at first failure, the agent tries multiple candidates. These suggestions required more than one attempt.
      </div>
      {loading ? <div style={{ color: '#94a3b8' }}>Loading...</div> : suggestions.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 14 }}>
          No retries recorded yet — run the agent a few times and this will populate when candidates fail constraints.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suggestions.map(s => (
            <div key={s.id} style={{
              padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
            }}>
              <span style={{ fontWeight: 700 }}>{s.payload?.studentName || 'Student'}</span>
              <span style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8' }}>{s.type.replace(/_/g, ' ')}</span>
              <div style={{ fontSize: 12, color: '#0284c7', marginTop: 4 }}>
                Agent tried <strong>{s.candidates_tried}</strong> candidates before selecting this one
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function Skeleton({ height = 120 }: { height?: number }) {
  return (
    <div style={{
      background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      borderRadius: 8,
      height,
      marginBottom: 16,
    }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

function SectionError({ name, onRetry, detail }: { name: string; onRetry: () => void; detail?: string }) {
  return (
    <div style={{
      background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10,
      padding: '16px 20px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>{name} failed to load</div>
        <div style={{ fontSize: 12, color: '#9f1239', marginTop: 4, maxWidth: 560 }}>
          {detail ?? 'Check your network connection or API availability.'}
        </div>
      </div>
      <button onClick={onRetry} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        Retry
      </button>
    </div>
  );
}

// ─── Section Divider ──────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, icon }: { title: string; subtitle: string; icon: string }) {
  return (
    <div style={{ marginBottom: 20, marginTop: 8, paddingBottom: 12, borderBottom: '2px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{title}</h3>
      </div>
      <p style={{ margin: '4px 0 0 30px', fontSize: 13, color: '#64748b' }}>{subtitle}</p>
    </div>
  );
}

// ─── Part 61 Banner ───────────────────────────────────────────────────────────

function Part61Banner() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
      border: '1px solid #f59e0b',
      borderRadius: 10,
      padding: '14px 20px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    }}>
      <span style={{ fontSize: 22 }}>✈</span>
      <div>
        <div style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>Part 61 Mode Active — Frequency-First View</div>
        <div style={{ fontSize: 13, color: '#78350f', marginTop: 4, lineHeight: 1.6 }}>
          Part 61 schools don't have structured lesson data, so the agent focuses on <strong>flight frequency</strong> instead of lesson completion.
          Graduation risk is calculated from <strong>flights per week vs. the 40-hour minimum</strong>.
          The agent generates frequency nudge suggestions instead of lesson-specific scheduling.
        </div>
      </div>
    </div>
  );
}

// ─── Main Analysis Tab ────────────────────────────────────────────────────────

export default function AnalysisTab() {
  const [schoolType, setSchoolType] = useState<SchoolType>('part_141');
  const [loadingSchoolType, setLoadingSchoolType] = useState(true);
  const [activeSection, setActiveSection] = useState<'revenue' | 'students' | 'intelligence'>('revenue');

  useEffect(() => {
    api.getSchoolType()
      .then(d => setSchoolType(d.school_type))
      .catch(() => {})
      .finally(() => setLoadingSchoolType(false));
  }, []);

  const sections = [
    { id: 'revenue' as const, label: 'Revenue', icon: '💰' },
    { id: 'students' as const, label: 'Student Risk', icon: '🎓' },
    { id: 'intelligence' as const, label: 'Agent Intelligence', icon: '🤖' },
  ];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#1e293b' }}>Analysis</h2>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
            Revenue impact · Student risk · Agent intelligence
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="no-print"
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#f8fafc', color: '#475569', fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ⬇ Export PDF
        </button>
      </div>

      {/* School type toggle */}
      {!loadingSchoolType && (
        <SchoolTypeToggle schoolType={schoolType} onToggle={setSchoolType} />
      )}

      {/* Part 61 banner */}
      {schoolType === 'part_61' && <Part61Banner />}

      {/* Agent narrative always visible */}
      <AgentNarrative />

      {/* Section tabs */}
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: '2px solid',
              borderColor: activeSection === s.id ? '#3b82f6' : '#e2e8f0',
              background: activeSection === s.id ? '#3b82f6' : '#f8fafc',
              color: activeSection === s.id ? '#fff' : '#475569',
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span>{s.icon}</span>{s.label}
          </button>
        ))}
      </div>

      {/* Section: Revenue */}
      {activeSection === 'revenue' && (
        <div>
          <SectionHeader
            icon="💰"
            title="Revenue Impact"
            subtitle="Where the money comes from, where it's at risk, and what the agent recovered"
          />
          <RevenueBreakdown />
          <CancellationImpact />
        </div>
      )}

      {/* Section: Student Risk */}
      {activeSection === 'students' && (
        <div>
          <SectionHeader
            icon="🎓"
            title="Student Risk"
            subtitle={schoolType === 'part_61'
              ? 'Part 61 mode: frequency tracking only — no structured lesson data available'
              : 'Graduation pace, extra cost projections, and students needing a nudge'}
          />
          <GraduationRiskTable />
          <FrequencyLeaderboard />
          <FrequencyNudgeFeed />
        </div>
      )}

      {/* Section: Agent Intelligence */}
      {activeSection === 'intelligence' && (
        <div>
          <SectionHeader
            icon="🤖"
            title="Agent Intelligence"
            subtitle="How the agent scores, retries, and compares to a rule-based constraint solver"
          />
          <AcceptanceRateChart />
          <ConstraintSolverComparison />
          <AgentRetryVisibility />
        </div>
      )}

      {/* Print: show all sections */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
        @media print {
          .print-only { display: block !important; }
        }
      `}</style>
      <div className="print-only" style={{ display: 'none' }}>
        <RevenueBreakdown />
        <CancellationImpact />
        <GraduationRiskTable />
        <FrequencyLeaderboard />
        <AcceptanceRateChart />
        <ConstraintSolverComparison />
      </div>
    </div>
  );
}
