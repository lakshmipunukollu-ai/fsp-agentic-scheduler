import { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import BrandMark from './BrandMark';
import PilotbaseWordmark from './PilotbaseWordmark';
import InAppNotificationBell from './InAppNotificationBell';
import AccountContact from './AccountContact';

interface Progress {
  hoursLogged: number;
  hoursScheduled: number;
  hoursRequired: number;
  hoursRemaining: number;
  completionPct: number;
  paceStatus: string;
  paceDiff: number;
  projectedGradDate: string;
}

interface Profile {
  name: string;
  email: string;
  license_type: string;
  instructor_name: string;
  aircraft_tail: string;
  /** Operator (flight school) display name */
  school_name?: string;
  /** Part 141 vs Part 61 — matches school Analysis mode */
  school_type?: 'part_141' | 'part_61';
  /** From DB when present */
  last_flight_date?: string | null;
  flights_last_30_days?: number;
}

interface AIScheduleSlot {
  date: string;
  startTime: string;
  endTime: string;
  lessonType: string;
  instructorName: string;
  aircraftTail: string;
  durationHours: number;
  lessonNumber: number;
  objectives: string[];
}

interface ScheduledLesson {
  id: string;
  lesson_type: string;
  instructor_name: string;
  aircraft_tail: string;
  start_time: string;
  end_time: string;
  status: string;
  duration_hours: number;
}

interface LessonRequestRow {
  id: string;
  status: string;
  requested_hours: number;
  created_at: string;
  /** Present on full profile rows — proposed slots not yet in scheduled_lessons until staff approves */
  ai_schedule?: AIScheduleSlot[] | null;
}

const LICENSE_LABELS: Record<string, string> = {
  PPL: 'Private Pilot License',
  IR: 'Instrument Rating',
  CPL: 'Commercial Pilot License',
};

const PROCESSING_STEPS = [
  'Checking your availability windows...',
  'Matching with your instructor...',
  'Verifying aircraft availability...',
  'Sequencing lessons by curriculum...',
  'Applying FAA rest requirements...',
  'Optimizing your schedule...',
  'Almost there...',
];

/** ISO dates (local midnight → UTC date string) for [startOffset, startOffset + numDays). */
function getDateRangeDays(startOffsetDays: number, numDays: number): string[] {
  const days: string[] = [];
  const n = Math.min(120, Math.max(1, numDays));
  const off = Math.max(0, startOffsetDays);
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + off + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

const HORIZON_OPTIONS = [7, 14, 21, 28, 56, 90] as const;
const START_OFFSET_OPTIONS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: '+1 week', days: 7 },
  { label: '+2 weeks', days: 14 },
  { label: '+3 weeks', days: 21 },
  { label: '+4 weeks', days: 28 },
];

function requestStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending_approval: 'Pending school approval',
    approved: 'Approved',
    declined: 'Declined',
    partial: 'Partially approved',
    superseded: 'Replaced by newer request',
  };
  return map[status] ?? status.replace(/_/g, ' ');
}

/** Overlay unsaved draft slots (Request tab) so calendar matches edits before Submit. */
function applyDraftScheduleToRequests(
  recentRequests: LessonRequestRow[],
  draftRequestId: string | null,
  draftSchedule: AIScheduleSlot[] | null
): LessonRequestRow[] {
  if (!draftRequestId || !draftSchedule?.length) return recentRequests;
  return recentRequests.map(r =>
    r.id === draftRequestId && r.status === 'pending_approval' ? { ...r, ai_schedule: draftSchedule } : r
  );
}

/** Calendar only showed scheduled_lessons; pending AI proposals live on lesson_requests.ai_schedule until approve-request. */
function mergeScheduledLessonRowsWithPendingProposals(
  lessons: ScheduledLesson[],
  recentRequests: LessonRequestRow[]
): ScheduledLesson[] {
  const pending: ScheduledLesson[] = [];
  for (const req of recentRequests) {
    if (req.status !== 'pending_approval') continue;
    const raw = req.ai_schedule;
    if (!Array.isArray(raw) || raw.length === 0) continue;
    raw.forEach((slot: AIScheduleSlot, i: number) => {
      if (!slot?.date || slot.startTime == null || slot.endTime == null) return;
      const start = new Date(`${slot.date}T${slot.startTime}:00`);
      const end = new Date(`${slot.date}T${slot.endTime}:00`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      pending.push({
        id: `pending-${req.id}-${i}`,
        lesson_type: slot.lessonType || 'Proposed lesson',
        instructor_name: slot.instructorName || '—',
        aircraft_tail: slot.aircraftTail || '—',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: 'pending',
        duration_hours: typeof slot.durationHours === 'number' ? slot.durationHours : Number(slot.durationHours) || 2,
      });
    });
  }
  return [...lessons, ...pending].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
}

function requestStatusBadgeStyle(status: string): { background: string; color: string } {
  if (status === 'approved') return { background: '#ecfdf5', color: '#059669' };
  if (status === 'pending_approval') return { background: '#eff6ff', color: '#2563eb' };
  if (status === 'superseded') return { background: '#f1f5f9', color: '#475569' };
  return { background: '#fef2f2', color: '#dc2626' };
}

function StudentMissionBar({
  onRequest,
  onCalendar,
}: {
  onRequest: () => void;
  onCalendar: () => void;
}) {
  return (
    <div style={styles.missionBar}>
      <div style={styles.missionText}>
        <strong style={{ color: '#0f172a' }}>Your path forward.</strong>{' '}
        Student progress, scheduling, and clarity from first flight toward career outcomes — inspired by the{' '}
        <a href="https://pilotbase.com/" target="_blank" rel="noopener noreferrer" style={{ color: '#0891b2' }}>
          Pilot Experience Platform
        </a>{' '}
        vision (demo app; not affiliated).
      </div>
      <div style={styles.missionActions}>
        <button type="button" onClick={onRequest} style={styles.missionBtnPrimary}>
          Request schedule
        </button>
        <button type="button" onClick={onCalendar} style={styles.missionBtnGhost}>
          My calendar
        </button>
      </div>
    </div>
  );
}

function TrainingTeamCard({ profile }: { profile: Profile | null }) {
  if (!profile) return null;
  const last = profile.last_flight_date
    ? new Date(profile.last_flight_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return (
    <div style={styles.teamCard}>
      <div style={styles.teamCardTitle}>Your training team</div>
      <div style={styles.teamGrid}>
        <div style={styles.teamItem}>
          <div style={styles.teamLabel}>Instructor</div>
          <div style={styles.teamValue}>{profile.instructor_name || '—'}</div>
        </div>
        <div style={styles.teamItem}>
          <div style={styles.teamLabel}>Aircraft</div>
          <div style={styles.teamValue}>{profile.aircraft_tail || '—'}</div>
        </div>
        <div style={styles.teamItem}>
          <div style={styles.teamLabel}>Last flight</div>
          <div style={styles.teamValue}>{last ?? '—'}</div>
        </div>
        <div style={styles.teamItem}>
          <div style={styles.teamLabel}>Flights (30d)</div>
          <div style={styles.teamValue}>{profile.flights_last_30_days ?? '—'}</div>
        </div>
      </div>
    </div>
  );
}

function RecentRequestsPanel({ requests }: { requests: LessonRequestRow[] }) {
  if (requests.length === 0) return null;
  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Recent schedule requests</h3>
      <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 14 }}>
        Track requests you’ve submitted for AI-built schedules. Your school approves before lessons appear on your calendar.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        {requests.map(r => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 14px',
              background: '#f8fafc',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              flexWrap: 'wrap' as const,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                {Number(r.requested_hours).toFixed(1)}h requested
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 20,
                ...requestStatusBadgeStyle(r.status),
              }}
            >
              {requestStatusLabel(r.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PilotResourcesStrip() {
  const links = [
    { label: 'Pilotbase', hint: 'Training platform', href: 'https://pilotbase.com/' },
    { label: 'Aviation weather', hint: 'METARs & TAFs', href: 'https://aviationweather.gov/' },
    { label: 'FAA regulations', hint: 'Rules & policy', href: 'https://www.faa.gov/regulations_policies' },
    { label: 'SkyVector', hint: 'Charts & planning', href: 'https://skyvector.com/' },
  ];
  return (
    <div style={styles.resourceHero} role="region" aria-label="Pilot resources">
      <div style={styles.resourceHeroHead}>
        <span style={styles.resourceHeroIcon} aria-hidden>📚</span>
        <div>
          <div style={styles.resourceHeroTitle}>Pilot resources</div>
          <div style={styles.resourceHeroSub}>Planning, weather, rules, and charts — one tap away</div>
        </div>
      </div>
      <div style={styles.resourceHeroGrid}>
        {links.map(l => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.resourceHeroLink}
          >
            <span style={styles.resourceHeroLinkLabel}>{l.label}</span>
            <span style={styles.resourceHeroLinkHint}>{l.hint}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function NotificationPreferences() {
  const [prefs, setPrefs] = useState<{ sms: boolean; email: boolean; in_app: boolean }>({ sms: true, email: true, in_app: true });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getNotificationPrefs()
      .then(p => setPrefs({ sms: p.sms, email: p.email, in_app: p.in_app }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.setNotificationPrefs(prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Notification Preferences</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Saved to your account — not just this browser.</div>
      {loading ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading...</div> : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const, marginBottom: 12 }}>
          {([
            { key: 'email' as const, label: 'Email', desc: 'Email for approvals and reminders' },
            { key: 'in_app' as const, label: 'In-App', desc: 'Portal notifications' },
          ]).map(opt => (
            <label key={opt.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={prefs[opt.key]} onChange={e => setPrefs(p => ({ ...p, [opt.key]: e.target.checked }))} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      )}
      <button onClick={save} disabled={saving} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saved ? '✓ Saved to account' : saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
}

function GraduationCountdown({ progress, avgLessonPrice, flightsLast30Days }: {
  progress: Progress;
  avgLessonPrice: number;
  flightsLast30Days?: number;
}) {
  const currentFlightsPerWeek = flightsLast30Days != null ? flightsLast30Days / 4.33 : 1;
  const optimalFlightsPerWeek = 3;

  const weeksToGradAtCurrent = currentFlightsPerWeek > 0
    ? Math.ceil(progress.hoursRemaining / (currentFlightsPerWeek * 2))
    : null;
  const weeksToGradAtOptimal = Math.ceil(progress.hoursRemaining / (optimalFlightsPerWeek * 2));

  const currentGradDate = weeksToGradAtCurrent != null
    ? new Date(Date.now() + weeksToGradAtCurrent * 7 * 86400000)
    : null;
  const optimalGradDate = new Date(Date.now() + weeksToGradAtOptimal * 7 * 86400000);

  const extraHours = weeksToGradAtCurrent != null
    ? Math.max(0, weeksToGradAtCurrent * currentFlightsPerWeek * 2 - progress.hoursRemaining)
    : 0;
  const savings = Math.round(extraHours * avgLessonPrice);

  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthsDiff = weeksToGradAtCurrent != null
    ? Math.round((weeksToGradAtCurrent - weeksToGradAtOptimal) / 4.33)
    : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
      {/* Current pace */}
      <div style={{ background: currentGradDate == null || (weeksToGradAtCurrent ?? 0) > weeksToGradAtOptimal ? '#fef2f2' : '#f0fdf4', border: `1px solid ${currentGradDate == null || (weeksToGradAtCurrent ?? 0) > weeksToGradAtOptimal ? '#fca5a5' : '#86efac'}`, borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, color: '#94a3b8', marginBottom: 6 }}>At current pace</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626', marginBottom: 2 }}>
          {currentGradDate ? fmt(currentGradDate) : 'Unknown'}
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          ~{currentFlightsPerWeek.toFixed(1)}x/week · {progress.hoursRemaining.toFixed(0)}h remaining
        </div>
        {savings > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
            +${savings.toLocaleString()} in extra lessons
          </div>
        )}
      </div>

      {/* Optimal pace */}
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, color: '#94a3b8', marginBottom: 6 }}>Flying 3x/week</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d', marginBottom: 2 }}>
          {fmt(optimalGradDate)}
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          3x/week · minimum hours
        </div>
        {monthsDiff != null && monthsDiff > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#15803d', fontWeight: 600 }}>
            {monthsDiff} month{monthsDiff !== 1 ? 's' : ''} sooner · ${savings.toLocaleString()} saved
          </div>
        )}
      </div>
    </div>
  );
}

function FrequencyRecommendation({ hoursLogged, hoursRequired, flightsLast30Days, avgLessonPrice = 185 }: { hoursLogged: number; hoursRequired: number; flightsLast30Days?: number; avgLessonPrice?: number }) {
  const AVG_LESSON_PRICE = avgLessonPrice;
  const hoursRemaining = Math.max(0, hoursRequired - hoursLogged);

  // Use real DB value if available, otherwise fall back to typical new student default
  const currentFlightsPerWeek = flightsLast30Days != null ? flightsLast30Days / 4.33 : 1.5;
  const recommendedFlightsPerWeek = 3;

  const calcProjected = (flightsPerWeek: number) => {
    const hoursPerWeek = flightsPerWeek * 2;
    const OPTIMAL = 6;
    const paceFactor = Math.min(OPTIMAL / Math.max(hoursPerWeek, 0.5), 2.5);
    return Math.round(hoursLogged + hoursRemaining * paceFactor);
  };

  const currentProjected = calcProjected(currentFlightsPerWeek);
  const recommendedProjected = hoursRequired; // optimal pace hits minimum
  const extraHours = Math.max(0, currentProjected - recommendedProjected);
  const savings = Math.round(extraHours * AVG_LESSON_PRICE);

  // Cost projection chart data
  const weeks = Array.from({ length: 12 }, (_, i) => i + 1);
  const chartData = weeks.map(w => ({
    week: `Wk ${w}`,
    current: Math.min(hoursLogged + w * currentFlightsPerWeek * 2, currentProjected),
    recommended: Math.min(hoursLogged + w * recommendedFlightsPerWeek * 2, hoursRequired),
    target: hoursRequired,
  }));

  if (extraHours === 0) return null;

  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#92400e', fontSize: 15, marginBottom: 8 }}>
        💡 Fly {recommendedFlightsPerWeek}x/week and save ${savings.toLocaleString()}
      </div>
      <div style={{ fontSize: 13, color: '#78350f', marginBottom: 16, lineHeight: 1.6 }}>
        At your current pace (~{currentFlightsPerWeek}x/week), you'll graduate around <strong>{currentProjected}h</strong> — {extraHours}h more than the {hoursRequired}h minimum.
        That's <strong>${savings.toLocaleString()} in extra lessons</strong>. Flying 3x/week keeps you on the optimal track.
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#fef3c7" />
          <XAxis dataKey="week" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={[hoursLogged, Math.max(currentProjected, hoursRequired) + 5]} />
          <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${v}h`, '']} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="current" name="Current pace" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 3" />
          <Line type="monotone" dataKey="recommended" name="3x/week pace" stroke="#22c55e" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="target" name={`${hoursRequired}h goal`} stroke="#94a3b8" strokeWidth={1} dot={false} strokeDasharray="2 4" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Part61TierExplainer() {
  return (
    <div style={styles.tierCard}>
      <div style={styles.tierCardTitle}>Part 61 — tiered support (per FAA program style)</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
        <li><strong>Tier 1:</strong> Flight frequency and last flight — we nudge you when you&apos;ve been idle too long.</li>
        <li><strong>Tier 2:</strong> When your school shares hours, we compare your pace to typical graduation curves (e.g. ~40h best case vs 60–80h if infrequent).</li>
        <li><strong>Tier 3:</strong> Full structured syllabus — use <strong>Part 141</strong> school mode for lesson-by-lesson AI scheduling.</li>
      </ul>
    </div>
  );
}

function LessonDetailModal({
  lesson,
  onClose,
  onCancelled,
}: {
  lesson: ScheduledLesson;
  onClose: () => void;
  onCancelled?: () => void | Promise<void>;
}) {
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelErr, setCancelErr] = useState('');
  const STATUS_COLOR: Record<string, string> = { confirmed: '#22c55e', completed: '#64748b', pending: '#f59e0b', cancelled: '#ef4444' };
  const STATUS_BG: Record<string, string> = { confirmed: '#f0fdf4', completed: '#f8fafc', pending: '#fffbeb', cancelled: '#fef2f2' };
  const start = new Date(lesson.start_time);
  const end = new Date(lesson.end_time);
  const canCancel =
    lesson.status === 'confirmed' && start.getTime() > Date.now();

  const handleCancelLesson = async () => {
    if (!canCancel || cancelLoading) return;
    if (!window.confirm('Cancel this lesson? Dispatch will be notified and the slot may be offered to another student.')) return;
    setCancelLoading(true);
    setCancelErr('');
    try {
      await api.cancelStudentLesson(lesson.id);
      await onCancelled?.();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not cancel';
      // Stale UI (e.g. re-seeded DB, cancelled elsewhere): resync and dismiss modal.
      if (/not found/i.test(msg)) {
        await onCancelled?.();
        onClose();
        return;
      }
      setCancelErr(msg);
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{lesson.lesson_type}</div>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: STATUS_BG[lesson.status] || '#f8fafc', color: STATUS_COLOR[lesson.status] || '#64748b', textTransform: 'capitalize' as const }}>
              {lesson.status}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>📅</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                {start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {' · '}{lesson.duration_hours}h
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>👨‍✈️</span>
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Instructor</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{lesson.instructor_name}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>✈️</span>
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Aircraft</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{lesson.aircraft_tail}</div>
            </div>
          </div>
        </div>

        {canCancel && (
          <div style={{ marginTop: 20 }}>
            {cancelErr && (
              <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#b91c1c' }}>
                {cancelErr}
              </div>
            )}
            <button
              type="button"
              onClick={handleCancelLesson}
              disabled={cancelLoading}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#b91c1c',
                fontSize: 13,
                fontWeight: 700,
                cursor: cancelLoading ? 'wait' : 'pointer',
                opacity: cancelLoading ? 0.75 : 1,
              }}
            >
              {cancelLoading ? 'Cancelling…' : 'Cancel this lesson'}
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
              Notifies dispatch and may surface the open slot to another student in the approval queue.
            </div>
          </div>
        )}
        {lesson.status === 'confirmed' && !canCancel && (
          <div style={{ marginTop: 20, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
            This lesson is in the past or already started — contact your school to adjust.
          </div>
        )}
        {lesson.status === 'pending' && (
          <div style={{ marginTop: 20, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e', lineHeight: 1.55 }}>
            Proposed lesson — not confirmed until your school approves. After approval it appears as a confirmed booking.
          </div>
        )}
      </div>
    </div>
  );
}

function MonthlyCalendar({ lessons, onRequestSchedule, onCalendarRefresh }: { lessons: ScheduledLesson[]; onRequestSchedule: () => void; onCalendarRefresh?: () => void | Promise<void> }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedLesson, setSelectedLesson] = useState<ScheduledLesson | null>(null);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Index lessons by day-of-month
  const byDay: Record<number, ScheduledLesson[]> = {};
  for (const lesson of lessons) {
    const d = new Date(lesson.start_time);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(lesson);
    }
  }

  const STATUS_DOT: Record<string, string> = { confirmed: '#22c55e', completed: '#64748b', pending: '#f59e0b', cancelled: '#ef4444' };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
    const dayLessons = byDay[d] || [];
    cells.push(
      <div key={d} style={{
        background: isToday ? '#eff6ff' : '#fff',
        border: isToday ? '2px solid #3b82f6' : '1px solid #e2e8f0',
        borderRadius: 8,
        minHeight: 70,
        padding: '6px 8px',
        position: 'relative' as const,
        cursor: 'default',
        transition: 'box-shadow 0.1s',
      }}
      >
        <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? '#2563eb' : '#475569', marginBottom: 4 }}>{d}</div>
        {dayLessons.map((l) => (
          <div
            key={l.id}
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); setSelectedLesson(l); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedLesson(l); } }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 2,
              cursor: 'pointer',
              borderRadius: 4,
              padding: '1px 0',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[l.status] || '#94a3b8', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {new Date(l.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{monthName}</div>
        <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8', paddingBottom: 4 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
        {[['confirmed', '#22c55e', 'Confirmed'], ['pending', '#f59e0b', 'Pending'], ['completed', '#64748b', 'Completed']].map(([s, c, l]) => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}
          </span>
        ))}
      </div>
      {Object.keys(byDay).length === 0 && (
        <div style={{ textAlign: 'center' as const, marginTop: 16, color: '#94a3b8', fontSize: 13 }}>
          No lessons this month.{' '}
          <button onClick={onRequestSchedule} style={{ border: 'none', background: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Request a schedule →</button>
        </div>
      )}
      {Object.keys(byDay).length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', textAlign: 'center' as const }}>Tap any lesson to view details</div>
      )}
      {selectedLesson && (
        <LessonDetailModal
          lesson={selectedLesson}
          onClose={() => setSelectedLesson(null)}
          onCancelled={onCalendarRefresh}
        />
      )}
    </div>
  );
}

export default function StudentPortal() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'progress' | 'request' | 'calendar' | 'account'>('progress');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [lessons, setLessons] = useState<ScheduledLesson[]>([]);
  const [data, setData] = useState<any>(null);
  const [recentRequests, setRecentRequests] = useState<LessonRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgLessonPrice, setAvgLessonPrice] = useState<number>(185);

  // Request schedule state
  const [availWindows, setAvailWindows] = useState<Record<string, { startTime: string; endTime: string; enabled: boolean }>>({});
  const [goalHours, setGoalHours] = useState(4);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [aiSchedule, setAiSchedule] = useState<AIScheduleSlot[] | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [horizonDays, setHorizonDays] = useState<number>(14);
  const [rangeStartOffset, setRangeStartOffset] = useState(0);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  /** Incremented on each slot edit so debounced PATCH persists + audit logs draft updates */
  const [draftEditGeneration, setDraftEditGeneration] = useState(0);
  const bumpDraftEdit = () => setDraftEditGeneration((g) => g + 1);
  const aiScheduleSaveRef = useRef<AIScheduleSlot[] | null>(null);
  const lastRequestSaveRef = useRef<string | null>(null);
  aiScheduleSaveRef.current = aiSchedule;
  lastRequestSaveRef.current = lastRequestId;

  const dateRange = useMemo(() => getDateRangeDays(rangeStartOffset, horizonDays), [rangeStartOffset, horizonDays]);
  const weekStart = dateRange[0] ?? new Date().toISOString().split('T')[0];

  // If another tab logs in as a different user, the localStorage token changes. Detect this
  // and log out gracefully rather than making API calls with the wrong token.
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user' && e.newValue) {
        try {
          const newUser = JSON.parse(e.newValue) as { id: string };
          if (user && newUser.id !== user.id) {
            logout();
          }
        } catch { /* ignore */ }
      }
      if (e.key === 'token' && !e.newValue) {
        logout();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [user, logout]);

  useEffect(() => {
    loadProfile();
  }, []);

  // Build / merge availability map when the calendar range changes
  useEffect(() => {
    setAvailWindows(prev => {
      const next: typeof prev = {};
      dateRange.forEach(d => {
        next[d] = prev[d] || { startTime: '09:00', endTime: '17:00', enabled: false };
      });
      return next;
    });
  }, [dateRange]);

  useEffect(() => {
    if (draftEditGeneration === 0 || !lastRequestId || !aiSchedule?.length) return;
    const t = setTimeout(() => {
      const rid = lastRequestSaveRef.current;
      const sched = aiScheduleSaveRef.current;
      if (!rid || !sched?.length) return;
      void api.saveLessonRequestDraft(rid, { aiSchedule: sched });
    }, 2000);
    return () => clearTimeout(t);
  }, [draftEditGeneration, lastRequestId]);

  const loadProfile = async () => {
    try {
      const [dataResponse, revenueData] = await Promise.all([
        api.getStudentProfile(),
        api.getRevenueBreakdown().catch(() => null),
      ]);
      setProfile(dataResponse.profile as Profile);
      setProgress(dataResponse.progress);
      setLessons(dataResponse.lessons as ScheduledLesson[]);
      setRecentRequests((dataResponse as { recentRequests?: LessonRequestRow[] }).recentRequests ?? []);
      setData(dataResponse);
      if (revenueData?.avg_lesson_price_usd) {
        setAvgLessonPrice(revenueData.avg_lesson_price_usd);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSchedule = async () => {
    const windows = Object.entries(availWindows)
      .filter(([, v]) => v.enabled)
      .map(([date, v]) => ({ date, startTime: v.startTime, endTime: v.endTime }));

    if (windows.length === 0) {
      setRequestError('Please select at least one availability window.');
      return;
    }

    setProcessing(true);
    setProcessingStep(0);
    setAiSchedule(null);
    setLastRequestId(null);
    setDraftEditGeneration(0);
    setRequestError('');

    const stepInterval = setInterval(() => {
      setProcessingStep(prev => {
        if (prev < PROCESSING_STEPS.length - 1) return prev + 1;
        return prev;
      });
    }, 700);

    try {
      const result = await api.requestSchedule({
        windows,
        goalHours,
        weekStart,
        horizonDays,
        rangeStartOffset,
      });
      clearInterval(stepInterval);
      setProcessingStep(PROCESSING_STEPS.length - 1);
      setAiSchedule(result.schedule as AIScheduleSlot[]);
      setLastRequestId(result.request.id);
      await loadProfile();
    } catch (err: unknown) {
      clearInterval(stepInterval);
      setRequestError(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setProcessing(false);
    }
  };

  const updateSlotAt = (index: number, patch: Partial<AIScheduleSlot>) => {
    setAiSchedule(prev => {
      if (!prev) return null;
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
    bumpDraftEdit();
  };

  const removeSlotAt = (index: number) => {
    setAiSchedule(prev => {
      if (!prev) return null;
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((s, i) => ({ ...s, lessonNumber: i + 1 }));
    });
    bumpDraftEdit();
  };

  const handleSubmitForApproval = async () => {
    if (!lastRequestId || !aiSchedule?.length) {
      setRequestError('Nothing to submit — generate a schedule first.');
      return;
    }
    setSubmitLoading(true);
    setRequestError('');
    try {
      await api.submitLessonRequestSchedule(lastRequestId, { aiSchedule });
      setSubmitSuccess(true);
      setAiSchedule(null);
      setLastRequestId(null);
      setDraftEditGeneration(0);
      await loadProfile();
    } catch (err: unknown) {
      setRequestError(err instanceof Error ? err.message : 'Failed to submit schedule');
    } finally {
      setSubmitLoading(false);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const calendarLessons = useMemo(
    () =>
      mergeScheduledLessonRowsWithPendingProposals(
        lessons,
        applyDraftScheduleToRequests(recentRequests, lastRequestId, aiSchedule)
      ),
    [lessons, recentRequests, lastRequestId, aiSchedule]
  );

  if (loading) return <div style={styles.loading}>Loading your portal...</div>;

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <BrandMark size={40} />
          <div>
            {profile?.school_name && (
              <div style={styles.headerSchool}>
                <span style={styles.headerSchoolName}>{profile.school_name}</span>
                <span
                  style={{
                    ...styles.headerSchoolBadge,
                    ...(profile.school_type === 'part_61' ? styles.headerSchoolBadge61 : styles.headerSchoolBadge141),
                  }}
                >
                  {profile.school_type === 'part_61' ? 'Part 61' : 'Part 141'}
                </span>
              </div>
            )}
            <div style={styles.headerTitle}>Student Portal</div>
            <div style={{ marginTop: 6 }}>
              <PilotbaseWordmark height={15} />
            </div>
            <div style={styles.headerSub}>{profile?.name} · {LICENSE_LABELS[profile?.license_type || 'PPL']}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <InAppNotificationBell />
          <button onClick={logout} style={styles.logoutBtn}>Sign Out</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {([
          ['progress', '📊 My Progress'],
          ['request', '📅 Request Schedule'],
          ['calendar', '🗓 My Calendar'],
          ['account', '👤 Account'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
          >
            {label}
          </button>
        ))}
      </div>

      <PilotResourcesStrip />

      {profile?.school_type === 'part_61' && (
        <div style={{ maxWidth: 900, margin: '0 auto 16px', padding: '0 24px' }}>
          <Part61TierExplainer />
        </div>
      )}

      <div style={styles.missionOuter}>
        <StudentMissionBar onRequest={() => setActiveTab('request')} onCalendar={() => setActiveTab('calendar')} />
      </div>

      <div style={styles.content}>
        {/* PROGRESS TAB */}
        {activeTab === 'progress' && progress && (
          <div>
            <TrainingTeamCard profile={profile} />
            <RecentRequestsPanel requests={recentRequests} />

            {/* At-risk banner */}
            {progress.paceStatus !== 'ahead' && progress.paceDiff > 5 && (
              <div style={{ background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 24 }}>⚠️</span>
                <div>
                  <strong style={{ color: '#dc2626', fontSize: 15 }}>Your graduation timeline is at risk</strong>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    You're {progress.paceDiff}h behind your target pace. Flying more frequently will reduce extra hours and cost.
                    Contact your instructor or request a schedule below.
                  </div>
                </div>
              </div>
            )}

            {/* Pace badge */}
            <div style={{ ...styles.paceBanner, background: progress.paceStatus === 'ahead' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${progress.paceStatus === 'ahead' ? '#86efac' : '#fca5a5'}` }}>
              <span style={{ fontSize: '20px' }}>{progress.paceStatus === 'ahead' ? '🚀' : '⚠️'}</span>
              <div>
                <strong style={{ color: progress.paceStatus === 'ahead' ? '#15803d' : '#dc2626' }}>
                  {progress.paceStatus === 'ahead' ? `${progress.paceDiff}h ahead of pace` : `${progress.paceDiff}h behind pace`}
                </strong>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                  Projected graduation: {new Date(progress.projectedGradDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </div>
              </div>
            </div>

            {/* Graduation countdown — current pace vs optimal pace side-by-side */}
            <GraduationCountdown progress={progress} avgLessonPrice={avgLessonPrice} flightsLast30Days={(data as { profile?: { flights_last_30_days?: number } })?.profile?.flights_last_30_days} />

            {/* Frequency recommendation + cost projection — uses real flights_last_30_days from DB */}
            <FrequencyRecommendation
              hoursLogged={progress.hoursLogged}
              hoursRequired={progress.hoursRequired}
              flightsLast30Days={(data as { profile?: { flights_last_30_days?: number } })?.profile?.flights_last_30_days}
              avgLessonPrice={avgLessonPrice}
            />

            {/* Hours breakdown */}
            <div style={styles.hoursGrid}>
              {[
                { label: 'Hours Logged', value: progress.hoursLogged, color: '#10b981', icon: '✅' },
                { label: 'Hours Scheduled', value: progress.hoursScheduled, color: '#2563eb', icon: '📅' },
                { label: 'Hours Remaining', value: progress.hoursRemaining, color: '#f59e0b', icon: '⏳' },
                { label: 'Total Required', value: progress.hoursRequired, color: '#6366f1', icon: '🎯' },
              ].map(card => (
                <div key={card.label} style={{ ...styles.hoursCard, borderTop: `3px solid ${card.color}` }}>
                  <div style={styles.hoursIcon}>{card.icon}</div>
                  <div style={{ ...styles.hoursValue, color: card.color }}>{card.value.toFixed(1)}h</div>
                  <div style={styles.hoursLabel}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div style={styles.progressSection}>
              <div style={styles.progressHeader}>
                <span style={styles.progressTitle}>Overall Progress — {LICENSE_LABELS[profile?.license_type || 'PPL']}</span>
                <span style={styles.progressPct}>{progress.completionPct}%</span>
              </div>
              <div style={styles.progressBarBg}>
                <div style={{ ...styles.progressBarFill, width: `${progress.completionPct}%` }} />
                <div style={{ ...styles.progressBarScheduled, width: `${Math.min(100 - progress.completionPct, (progress.hoursScheduled / progress.hoursRequired) * 100)}%`, left: `${progress.completionPct}%` }} />
              </div>
              <div style={styles.progressLegend}>
                <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#10b981' }} />Logged</span>
                <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#93c5fd' }} />Scheduled</span>
                <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#e2e8f0' }} />Remaining</span>
              </div>
            </div>

            {/* Course minimums table */}
            {(data as any)?.minimums && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Course Minimums — FAA Requirements</h3>
                {((data as any).minimums as any[]).map((m: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#475569', width: '140px', flexShrink: 0 }}>{m.label}</div>
                    <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${m.pct}%`, background: m.pct >= 100 ? '#10b981' : m.pct >= 50 ? '#f59e0b' : '#2563eb', borderRadius: '4px', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', width: '70px', textAlign: 'right' as const }}>{m.logged.toFixed(1)}/{m.required}h</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, width: '36px', color: m.pct >= 100 ? '#10b981' : '#64748b' }}>{m.pct}%</div>
                  </div>
                ))}
              </div>
            )}

            {/* Graduation simulator */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>🎓 Graduation Simulator</h3>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                Adjust your weekly lesson pace to see how it affects your graduation date.
              </p>
              <GraduationSimulator
                hoursLogged={progress.hoursLogged}
                hoursRequired={progress.hoursRequired}
                currentPace={2}
              />
            </div>

            {/* Upcoming lessons */}
            {lessons.filter(l => l.status === 'confirmed').length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Upcoming Confirmed Lessons</h3>
                {lessons.filter(l => l.status === 'confirmed').slice(0, 4).map(lesson => (
                  <div key={lesson.id} style={styles.lessonRow}>
                    <div style={styles.lessonDate}>{formatDate(lesson.start_time)}</div>
                    <div style={styles.lessonInfo}>
                      <div style={styles.lessonType}>{lesson.lesson_type}</div>
                      <div style={styles.lessonMeta}>{formatTime(lesson.start_time)} · {lesson.instructor_name} · {lesson.aircraft_tail}</div>
                    </div>
                    <div style={styles.lessonBadge}>✓ Confirmed</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* REQUEST SCHEDULE TAB */}
        {activeTab === 'request' && (
          <div>
            {submitSuccess ? (
              <div style={styles.successBox}>
                <div style={styles.successIcon}>🎉</div>
                <h2 style={styles.successTitle}>Schedule Submitted for Approval!</h2>
                <p style={styles.successBody}>
                  Dispatchers and admins were notified. Your instructor will review and confirm your lessons — you&apos;ll see them in My Calendar once approved.
                </p>
                <button onClick={() => { setSubmitSuccess(false); setActiveTab('calendar'); }} style={styles.successBtn}>View My Calendar →</button>
              </div>
            ) : aiSchedule ? (
              <div>
                <div style={styles.scheduleHeader}>
                  <h2 style={styles.scheduleTitle}>✨ Your AI-Generated Schedule</h2>
                  <p style={styles.scheduleSub}>
                    {aiSchedule.length} lessons · {aiSchedule.reduce((a, s) => a + s.durationHours, 0)}h total · Edit or remove slots, then submit — dispatchers and admins are notified.
                  </p>
                </div>
                {aiSchedule.map((slot, i) => (
                  <div key={`${slot.date}-${i}`} style={styles.slotCard}>
                    <div style={styles.slotLeft}>
                      <label style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Date</label>
                      <input
                        type="date"
                        value={slot.date}
                        onChange={e => updateSlotAt(i, { date: e.target.value })}
                        style={{ ...styles.slotDateInput, marginBottom: 6 }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                        <select value={slot.startTime} onChange={e => updateSlotAt(i, { startTime: e.target.value })} style={styles.timeSelect}>
                          {['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span style={styles.timeTo}>–</span>
                        <select value={slot.endTime} onChange={e => updateSlotAt(i, { endTime: e.target.value })} style={styles.timeSelect}>
                          {['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={styles.slotCenter}>
                      <div style={styles.slotLesson}>{slot.lessonType}</div>
                      <div style={styles.slotMeta}>{slot.instructorName} · {slot.aircraftTail} · {slot.durationHours}h</div>
                      <div style={styles.slotObjectives}>
                        {slot.objectives.slice(0, 2).map((obj, j) => (
                          <span key={j} style={styles.objective}>· {obj}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 8 }}>
                      <div style={styles.slotBadge}>Lesson {slot.lessonNumber}</div>
                      <button
                        type="button"
                        onClick={() => removeSlotAt(i)}
                        style={styles.slotRemoveBtn}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                  Submitting updates your request in the system and notifies every admin and dispatcher for your school in-app (Approval Queue + notifications).
                </div>
                <div style={styles.submitRow}>
                  <button type="button" onClick={() => { setAiSchedule(null); setLastRequestId(null); }} style={styles.retryBtn}>← Adjust Availability</button>
                  <button
                    type="button"
                    onClick={() => void handleSubmitForApproval()}
                    disabled={submitLoading || !lastRequestId || aiSchedule.length === 0}
                    style={{
                      ...styles.submitBtn,
                      opacity: submitLoading || !lastRequestId ? 0.7 : 1,
                      cursor: submitLoading || !lastRequestId ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {submitLoading ? 'Submitting…' : 'Submit for Approval →'}
                  </button>
                </div>
              </div>
            ) : processing ? (
              <div style={styles.processingBox}>
                <div style={styles.processingSpinner}>✈</div>
                <h2 style={styles.processingTitle}>Building Your Schedule</h2>
                <div style={styles.processingSteps}>
                  {PROCESSING_STEPS.map((step, i) => (
                    <div key={i} style={{ ...styles.processingStep, ...(i === processingStep ? styles.processingStepActive : i < processingStep ? styles.processingStepDone : styles.processingStepPending) }}>
                      <span>{i < processingStep ? '✓' : i === processingStep ? '⟳' : '○'}</span>
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <h2 style={styles.requestTitle}>Request Your Schedule</h2>
                <p style={styles.requestSub}>
                  Tell us when you&apos;re free and how many hours you want to fly. Pick a planning horizon (up to 90 days), then mark days you can fly. Our AI proposes a schedule you can edit before you submit.
                </p>

                {requestError && <div style={styles.errorBox}>{requestError}</div>}

                {/* Goal hours */}
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>How many hours do you want to fly?</h3>
                  <div style={styles.hoursSelector}>
                    {[2, 4, 6, 8, 10].map(h => (
                      <button key={h} onClick={() => setGoalHours(h)} style={{ ...styles.hoursPill, ...(goalHours === h ? styles.hoursPillActive : {}) }}>
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>

                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>Planning horizon</h3>
                  <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 10 }}>
                    How many consecutive days to consider when matching availability and weather.
                  </p>
                  <div style={styles.hoursSelector}>
                    {HORIZON_OPTIONS.map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setHorizonDays(d)}
                        style={{ ...styles.hoursPill, ...(horizonDays === d ? styles.hoursPillActive : {}) }}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                  <h3 style={{ ...styles.sectionTitle, marginTop: 18 }}>When does this window start?</h3>
                  <div style={styles.hoursSelector}>
                    {START_OFFSET_OPTIONS.map(o => (
                      <button
                        key={o.days}
                        type="button"
                        onClick={() => setRangeStartOffset(o.days)}
                        style={{ ...styles.hoursPill, ...(rangeStartOffset === o.days ? styles.hoursPillActive : {}) }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Availability */}
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>When are you available?</h3>
                  <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 12 }}>
                    {dateRange.length} days ({dateRange[0]} → {dateRange[dateRange.length - 1]}) — check the days you can fly.
                  </p>
                  <div style={{ ...styles.availGrid, maxHeight: 420, overflowY: 'auto' as const }}>
                    {dateRange.map(date => {
                      const w = availWindows[date] || { startTime: '09:00', endTime: '17:00', enabled: false };
                      const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      return (
                        <div key={date} style={{ ...styles.availDay, ...(w.enabled ? styles.availDayActive : {}) }}>
                          <div style={styles.availDayHeader}>
                            <label style={styles.availCheckbox}>
                              <input
                                type="checkbox"
                                checked={w.enabled}
                                onChange={e => setAvailWindows(prev => ({ ...prev, [date]: { ...prev[date], enabled: e.target.checked } }))}
                              />
                              <span style={styles.availDayLabel}>{dayLabel}</span>
                            </label>
                          </div>
                          {w.enabled && (
                            <div style={styles.availTimes}>
                              <select value={w.startTime} onChange={e => setAvailWindows(prev => ({ ...prev, [date]: { ...prev[date], startTime: e.target.value } }))} style={styles.timeSelect}>
                                {['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'].map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <span style={styles.timeTo}>to</span>
                              <select value={w.endTime} onChange={e => setAvailWindows(prev => ({ ...prev, [date]: { ...prev[date], endTime: e.target.value } }))} style={styles.timeSelect}>
                                {['10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'].map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button onClick={handleRequestSchedule} style={styles.generateBtn}>
                  ✨ Generate My Schedule
                </button>
              </div>
            )}
          </div>
        )}

        {/* CALENDAR TAB */}
        {activeTab === 'calendar' && (
          <div>
            <h2 style={styles.requestTitle}>My Calendar</h2>
            <MonthlyCalendar
              lessons={calendarLessons}
              onRequestSchedule={() => setActiveTab('request')}
              onCalendarRefresh={loadProfile}
            />
          </div>
        )}

        {/* ACCOUNT — contact email/phone + notification toggles */}
        {activeTab === 'account' && (
          <div>
            <h2 style={styles.requestTitle}>Account</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 16, maxWidth: 520 }}>
              Update the email your school uses for notifications. Changing email also changes how you sign in.
            </p>
            <AccountContact />
            <NotificationPreferences />
          </div>
        )}
      </div>
    </div>
  );
}

function GraduationSimulator({ hoursLogged, hoursRequired, currentPace }: { hoursLogged: number; hoursRequired: number; currentPace: number }) {
  const [lessonsPerWeek, setLessonsPerWeek] = useState(currentPace);
  const hoursRemaining = Math.max(0, hoursRequired - hoursLogged);
  const hoursPerWeek = lessonsPerWeek * 2;
  const weeksToGrad = Math.max(0, hoursRemaining / hoursPerWeek);
  const gradDate = new Date();
  gradDate.setDate(gradDate.getDate() + weeksToGrad * 7);
  const monthsToGrad = (weeksToGrad / 4.33).toFixed(1);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', color: '#374151', fontWeight: 600, minWidth: '140px' }}>Lessons per week:</div>
        <input type="range" min={1} max={7} value={lessonsPerWeek} onChange={e => setLessonsPerWeek(parseInt(e.target.value))} style={{ flex: 1, accentColor: '#2563eb' }} />
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#2563eb', minWidth: '30px' }}>{lessonsPerWeek}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Hours/Week', value: `${hoursPerWeek}h`, color: '#2563eb' },
          { label: 'Months to Graduate', value: monthsToGrad, color: lessonsPerWeek >= 3 ? '#10b981' : '#f59e0b' },
          { label: 'Est. Graduation', value: gradDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), color: '#6366f1' },
        ].map(card => (
          <div key={card.label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', textAlign: 'center' as const, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: card.color, marginBottom: '4px' }}>{card.value}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>{card.label}</div>
          </div>
        ))}
      </div>
      {lessonsPerWeek < 2 && <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '13px', color: '#dc2626' }}>⚠ Below 2 lessons/week puts you at risk of falling behind your graduation target.</div>}
      {lessonsPerWeek >= 4 && <div style={{ marginTop: '12px', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', fontSize: '13px', color: '#15803d' }}>🚀 At this pace you'll graduate {Math.round(weeksToGrad / 4.33 * 1)} months ahead of the standard timeline.</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#64748b' },

  header: { background: '#0f172a', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  headerSchool: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const, marginBottom: 8 },
  headerSchoolName: { color: '#f8fafc', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' },
  headerSchoolBadge: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid',
  },
  headerSchoolBadge141: {
    background: 'rgba(56, 189, 248, 0.15)',
    color: '#7dd3fc',
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  headerSchoolBadge61: {
    background: 'rgba(251, 191, 36, 0.12)',
    color: '#fcd34d',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  headerTitle: { color: '#fff', fontWeight: 700, fontSize: '16px' },
  headerSub: { color: '#94a3b8', fontSize: '13px', marginTop: '2px' },
  logoutBtn: { background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer' },

  tabs: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', display: 'flex', flexWrap: 'wrap' as const, gap: '4px' },
  tab: { background: 'none', border: 'none', padding: '16px 20px', fontSize: '14px', fontWeight: 500, color: '#64748b', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { color: '#2563eb', borderBottom: '2px solid #2563eb', fontWeight: 600 },

  missionOuter: { background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', padding: '16px 24px' },
  missionBar: {
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '14px 18px',
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  },
  missionText: { fontSize: 13, color: '#475569', lineHeight: 1.55, flex: '1 1 280px' },
  missionActions: { display: 'flex', gap: 10, flexShrink: 0 },
  missionBtnPrimary: {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  missionBtnGhost: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#334155',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },

  teamCard: {
    background: '#fff',
    borderRadius: 12,
    padding: '20px 24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    marginBottom: 20,
    border: '1px solid #e2e8f0',
  },
  teamCardTitle: { fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 },
  teamGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 },
  teamItem: { minWidth: 0 },
  teamLabel: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: '#94a3b8', marginBottom: 4 },
  teamValue: { fontSize: 14, fontWeight: 600, color: '#1e293b' },

  resourceHero: {
    maxWidth: 900,
    margin: '0 auto 20px',
    padding: '18px 20px',
    background: 'linear-gradient(135deg, #ecfeff 0%, #f0f9ff 50%, #ffffff 100%)',
    borderRadius: 14,
    border: '1px solid #99f6e4',
    boxShadow: '0 4px 18px rgba(8, 145, 178, 0.14)',
  },
  resourceHeroHead: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  resourceHeroIcon: { fontSize: 28, lineHeight: 1 },
  resourceHeroTitle: { fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' },
  resourceHeroSub: { fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.4 },
  resourceHeroGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(152px, 1fr))',
    gap: 10,
  },
  resourceHeroLink: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    padding: '12px 14px',
    borderRadius: 10,
    background: '#fff',
    border: '1px solid #bae6fd',
    textDecoration: 'none',
    color: '#0e7490',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
  },
  resourceHeroLinkLabel: { fontSize: 14, fontWeight: 700, color: '#0e7490' },
  resourceHeroLinkHint: { fontSize: 11, fontWeight: 500, color: '#64748b', lineHeight: 1.3 },

  tierCard: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 12,
    padding: '14px 18px',
    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  },
  tierCardTitle: { fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 10 },

  content: { maxWidth: '900px', margin: '0 auto', padding: '32px 24px' },

  paceBanner: { display: 'flex', alignItems: 'center', gap: '14px', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px' },
  hoursGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' },
  hoursCard: { background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', textAlign: 'center' as const },
  hoursIcon: { fontSize: '24px', marginBottom: '8px' },
  hoursValue: { fontSize: '28px', fontWeight: 800, marginBottom: '4px' },
  hoursLabel: { fontSize: '12px', color: '#64748b', fontWeight: 500 },

  progressSection: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '24px' },
  progressHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  progressTitle: { fontSize: '15px', fontWeight: 600, color: '#0f172a' },
  progressPct: { fontSize: '18px', fontWeight: 800, color: '#2563eb' },
  progressBarBg: { height: '12px', background: '#e2e8f0', borderRadius: '6px', position: 'relative' as const, overflow: 'hidden', marginBottom: '10px' },
  progressBarFill: { height: '100%', background: '#10b981', borderRadius: '6px', transition: 'width 1s ease', position: 'absolute' as const, left: 0 },
  progressBarScheduled: { height: '100%', background: '#93c5fd', borderRadius: '0 6px 6px 0', position: 'absolute' as const, transition: 'width 1s ease' },
  progressLegend: { display: 'flex', gap: '16px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' },
  legendDot: { width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' },

  section: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px' },
  sectionTitle: { fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '0 0 16px 0' },

  lessonRow: { display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: '1px solid #f1f5f9' },
  lessonDate: { fontSize: '13px', fontWeight: 600, color: '#475569', minWidth: '90px' },
  lessonInfo: { flex: 1 },
  lessonType: { fontSize: '14px', fontWeight: 600, color: '#0f172a' },
  lessonMeta: { fontSize: '12px', color: '#64748b', marginTop: '2px' },
  lessonBadge: { fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: '#ecfdf5', color: '#059669' },

  requestTitle: { fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' },
  requestSub: { fontSize: '15px', color: '#64748b', marginBottom: '28px' },
  errorBox: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px', color: '#dc2626', fontSize: '14px', marginBottom: '16px' },

  hoursSelector: { display: 'flex', gap: '10px', flexWrap: 'wrap' as const },
  hoursPill: { padding: '10px 24px', borderRadius: '25px', border: '2px solid #e2e8f0', background: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer', color: '#475569' },
  hoursPillActive: { border: '2px solid #2563eb', background: '#eff6ff', color: '#2563eb' },

  availGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' },
  availDay: { border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', background: '#f8fafc', transition: 'all 0.2s' },
  availDayActive: { border: '1px solid #93c5fd', background: '#eff6ff' },
  availDayHeader: { marginBottom: '8px' },
  availCheckbox: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' },
  availDayLabel: { fontSize: '14px', fontWeight: 600, color: '#374151' },
  availTimes: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' },
  timeTo: { fontSize: '13px', color: '#64748b' },
  timeSelect: { flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: '#fff' },

  generateBtn: { background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 32px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', width: '100%', marginTop: '8px', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' },

  processingBox: { background: '#0f172a', borderRadius: '16px', padding: '48px 32px', textAlign: 'center' as const },
  processingSpinner: { fontSize: '48px', animation: 'spin 2s linear infinite', display: 'inline-block', marginBottom: '20px' },
  processingTitle: { color: '#e2e8f0', fontSize: '22px', fontWeight: 700, margin: '0 0 28px 0' },
  processingSteps: { display: 'flex', flexDirection: 'column' as const, gap: '10px', maxWidth: '360px', margin: '0 auto', textAlign: 'left' as const },
  processingStep: { fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' },
  processingStepActive: { color: '#38bdf8', fontWeight: 600 },
  processingStepDone: { color: '#10b981' },
  processingStepPending: { color: '#334155' },

  scheduleHeader: { marginBottom: '24px' },
  scheduleTitle: { fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' },
  scheduleSub: { fontSize: '14px', color: '#64748b' },
  slotCard: { background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '12px', display: 'flex', alignItems: 'flex-start', gap: '20px', borderLeft: '4px solid #2563eb' },
  slotLeft: { minWidth: '100px' },
  slotDay: { fontSize: '13px', fontWeight: 700, color: '#2563eb' },
  slotTime: { fontSize: '13px', color: '#64748b', marginTop: '4px' },
  slotCenter: { flex: 1 },
  slotLesson: { fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '4px' },
  slotMeta: { fontSize: '13px', color: '#64748b', marginBottom: '8px' },
  slotObjectives: { display: 'flex', flexDirection: 'column' as const, gap: '2px' },
  objective: { fontSize: '12px', color: '#475569' },
  slotBadge: { background: '#eff6ff', color: '#2563eb', fontSize: '12px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', whiteSpace: 'nowrap' as const },
  slotDateInput: { fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#0f172a' },
  slotRemoveBtn: {
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #fecaca',
    background: '#fef2f2',
    color: '#b91c1c',
    cursor: 'pointer',
  },
  submitRow: { display: 'flex', gap: '12px', marginTop: '20px' },
  retryBtn: { flex: 1, padding: '12px', border: '1px solid #d1d5db', borderRadius: '10px', background: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: '#475569' },
  submitBtn: { flex: 2, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' },

  successBox: { background: '#fff', borderRadius: '16px', padding: '60px 40px', textAlign: 'center' as const, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  successIcon: { fontSize: '64px', marginBottom: '20px' },
  successTitle: { fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '0 0 12px 0' },
  successBody: { fontSize: '15px', color: '#64748b', lineHeight: '1.6', maxWidth: '400px', margin: '0 auto 24px' },
  successBtn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 28px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },

  emptyCalendar: { background: '#fff', borderRadius: '16px', padding: '60px', textAlign: 'center' as const, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
};
