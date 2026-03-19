import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

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

function getNextSevenDays(): string[] {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

export default function StudentPortal() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'progress' | 'request' | 'calendar'>('progress');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [lessons, setLessons] = useState<ScheduledLesson[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Request schedule state
  const [availWindows, setAvailWindows] = useState<Record<string, { startTime: string; endTime: string; enabled: boolean }>>({});
  const [goalHours, setGoalHours] = useState(4);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [aiSchedule, setAiSchedule] = useState<AIScheduleSlot[] | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [requestError, setRequestError] = useState('');

  const sevenDays = getNextSevenDays();
  const weekStart = sevenDays[0];

  useEffect(() => {
    loadProfile();
  }, []);

  // Initialize availability windows
  useEffect(() => {
    const initial: typeof availWindows = {};
    sevenDays.forEach(d => {
      initial[d] = { startTime: '09:00', endTime: '17:00', enabled: false };
    });
    setAvailWindows(initial);
  }, []);

  const loadProfile = async () => {
    try {
      const dataResponse = await api.getStudentProfile();
      setProfile(dataResponse.profile as Profile);
      setProgress(dataResponse.progress);
      setLessons(dataResponse.lessons as ScheduledLesson[]);
      setData(dataResponse);
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
    setRequestError('');

    const stepInterval = setInterval(() => {
      setProcessingStep(prev => {
        if (prev < PROCESSING_STEPS.length - 1) return prev + 1;
        return prev;
      });
    }, 700);

    try {
      const result = await api.requestSchedule({ windows, goalHours, weekStart });
      clearInterval(stepInterval);
      setProcessingStep(PROCESSING_STEPS.length - 1);
      setAiSchedule(result.schedule as AIScheduleSlot[]);
    } catch (err: unknown) {
      clearInterval(stepInterval);
      setRequestError(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitForApproval = () => {
    setSubmitSuccess(true);
    setAiSchedule(null);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (loading) return <div style={styles.loading}>Loading your portal...</div>;

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>PB</div>
          <div>
            <div style={styles.headerTitle}>Student Portal</div>
            <div style={styles.headerSub}>{profile?.name} · {LICENSE_LABELS[profile?.license_type || 'PPL']}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <NotificationBell userId="" />
          <button onClick={logout} style={styles.logoutBtn}>Sign Out</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['progress', 'request', 'calendar'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
          >
            {tab === 'progress' ? '📊 My Progress' : tab === 'request' ? '📅 Request Schedule' : '🗓 My Calendar'}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {/* PROGRESS TAB */}
        {activeTab === 'progress' && progress && (
          <div>
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
                <p style={styles.successBody}>Your instructor will review and confirm your lessons. You'll see them in My Calendar once approved.</p>
                <button onClick={() => { setSubmitSuccess(false); setActiveTab('calendar'); }} style={styles.successBtn}>View My Calendar →</button>
              </div>
            ) : aiSchedule ? (
              <div>
                <div style={styles.scheduleHeader}>
                  <h2 style={styles.scheduleTitle}>✨ Your AI-Generated Schedule</h2>
                  <p style={styles.scheduleSub}>{aiSchedule.length} lessons · {aiSchedule.reduce((a, s) => a + s.durationHours, 0)}h total · Pending instructor approval</p>
                </div>
                {aiSchedule.map((slot, i) => (
                  <div key={i} style={styles.slotCard}>
                    <div style={styles.slotLeft}>
                      <div style={styles.slotDay}>{formatDate(slot.date)}</div>
                      <div style={styles.slotTime}>{slot.startTime} – {slot.endTime}</div>
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
                    <div style={styles.slotBadge}>Lesson {slot.lessonNumber}</div>
                  </div>
                ))}
                <div style={styles.submitRow}>
                  <button onClick={() => setAiSchedule(null)} style={styles.retryBtn}>← Adjust Availability</button>
                  <button onClick={handleSubmitForApproval} style={styles.submitBtn}>Submit for Approval →</button>
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
                <p style={styles.requestSub}>Tell us when you're free and how many hours you want to fly this week. Our AI will build the perfect schedule.</p>

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

                {/* Availability */}
                <div style={styles.section}>
                  <h3 style={styles.sectionTitle}>When are you available? (Next 7 days)</h3>
                  <div style={styles.availGrid}>
                    {sevenDays.map(date => {
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
            {lessons.length === 0 ? (
              <div style={styles.emptyCalendar}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#374151' }}>No lessons scheduled yet</div>
                <div style={{ fontSize: '14px', color: '#94a3b8', marginTop: '8px' }}>Request a schedule to get started</div>
                <button onClick={() => setActiveTab('request')} style={{ ...styles.generateBtn, marginTop: '20px' }}>Request Schedule →</button>
              </div>
            ) : (
              <div>
                {lessons.map(lesson => (
                  <div key={lesson.id} style={{ ...styles.lessonRow, marginBottom: '8px', background: '#fff', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                    <div style={{ ...styles.lessonDate, minWidth: '80px' }}>{formatDate(lesson.start_time)}</div>
                    <div style={styles.lessonInfo}>
                      <div style={styles.lessonType}>{lesson.lesson_type}</div>
                      <div style={styles.lessonMeta}>{formatTime(lesson.start_time)} – {formatTime(lesson.end_time)} · {lesson.instructor_name} · {lesson.aircraft_tail}</div>
                    </div>
                    <div style={{
                      ...styles.lessonBadge,
                      background: lesson.status === 'confirmed' ? '#ecfdf5' : lesson.status === 'completed' ? '#f1f5f9' : '#fffbeb',
                      color: lesson.status === 'confirmed' ? '#059669' : lesson.status === 'completed' ? '#475569' : '#d97706',
                    }}>
                      {lesson.status === 'confirmed' ? '✓ Confirmed' : lesson.status === 'completed' ? '✓ Done' : '⏳ Pending'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.getStudentNotifications().then(d => setNotifications(d.notifications as any[])).catch(() => {});
    const interval = setInterval(() => {
      api.getStudentNotifications().then(d => setNotifications(d.notifications as any[])).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const unread = notifications.filter((n: any) => !n.read).length;

  return (
    <div style={{ position: 'relative' as const }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative' as const, padding: '4px' }}>
        <span style={{ fontSize: '22px' }}>🔔</span>
        {unread > 0 && (
          <span style={{ position: 'absolute' as const, top: 0, right: 0, background: '#ef4444', color: '#fff', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute' as const, right: 0, top: '40px', width: '320px', background: '#fff', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 100, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>Notifications</div>
          {notifications.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center' as const, color: '#94a3b8', fontSize: '13px' }}>No notifications</div>
          ) : notifications.map((n: any) => (
            <div key={n.id} style={{ padding: '14px 16px', borderBottom: '1px solid #f8fafc', background: n.read ? '#fff' : '#eff6ff' }}
              onClick={() => { api.markNotificationRead(n.id).catch(() => {}); setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x)); }}>
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>{n.title}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{n.body}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{new Date(n.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
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
  logo: { background: '#2563eb', color: '#fff', fontWeight: 800, fontSize: '14px', padding: '6px 10px', borderRadius: '6px' },
  headerTitle: { color: '#fff', fontWeight: 700, fontSize: '16px' },
  headerSub: { color: '#94a3b8', fontSize: '13px', marginTop: '2px' },
  logoutBtn: { background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: '6px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer' },

  tabs: { background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', display: 'flex', gap: '4px' },
  tab: { background: 'none', border: 'none', padding: '16px 20px', fontSize: '14px', fontWeight: 500, color: '#64748b', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { color: '#2563eb', borderBottom: '2px solid #2563eb', fontWeight: 600 },

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
