import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';

interface Minimum { category: string; label: string; required: number; logged: number; pct: number; }
interface Lesson { id: string; lesson_type: string; instructor_name: string; aircraft_tail: string; start_time: string; end_time: string; status: string; }
interface StudentDetail { profile: any; lessons: Lesson[]; requests: any[]; minimums: Minimum[]; }

interface Student {
  user_id: string; name: string; email: string; license_type: string;
  hoursLogged: number; hoursScheduled: number; hoursRequired: number;
  completionPct: number; daysSinceLastFlight: number; atRisk: boolean;
  projectedGradDate: string; expectedGradDate: string; weeksDelta: number;
  instructor_name: string; aircraft_tail: string; lessons_per_week_target: number;
  pendingRequests: number;
}

const LICENSE_COLORS: Record<string, string> = { PPL: '#2563eb', IR: '#7c3aed', CPL: '#d97706' };
const LICENSE_LABELS: Record<string, string> = { PPL: 'Private Pilot', IR: 'Instrument Rating', CPL: 'Commercial Pilot' };

export default function AdminStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'at_risk' | 'on_track' | 'pending_request'>('all');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadStudents();
    pollRef.current = setInterval(loadStudentsSilent, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const loadStudents = async () => {
    try {
      const data = await api.getAllStudents();
      setStudents(data.students as Student[]);
    } finally {
      setLoading(false);
    }
  };

  const loadStudentsSilent = async () => {
    try {
      const data = await api.getAllStudents();
      setStudents(data.students as Student[]);
    } catch { /* silent */ }
  };

  const handleSelectStudent = async (student: Student) => {
    setSelectedStudent(student);
    setDetailLoading(true);
    try {
      const detail = await api.getStudentDetailForAdmin(student.user_id);
      setStudentDetail(detail as StudentDetail);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = students.filter(s => {
    if (filter === 'at_risk') return s.atRisk;
    if (filter === 'on_track') return !s.atRisk && s.pendingRequests === 0;
    if (filter === 'pending_request') return s.pendingRequests > 0;
    return true;
  });

  const atRiskCount = students.filter(s => s.atRisk).length;
  const pendingRequestCount = students.filter(s => s.pendingRequests > 0).length;
  const avgCompletion = students.length > 0 ? Math.round(students.reduce((a, s) => a + s.completionPct, 0) / students.length) : 0;
  const totalHoursScheduled = students.reduce((a, s) => a + s.hoursScheduled, 0);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const formatMonth = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (loading) return <div style={styles.loading}>Loading students...</div>;

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      {/* Main list */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={styles.title}>Students</h1>
        <p style={styles.subtitle}>Training progress and graduation visibility across all enrolled students</p>

        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryValue}>{students.length}</div>
            <div style={styles.summaryLabel}>Total Students</div>
          </div>
          <div style={{ ...styles.summaryCard, borderTop: '3px solid #ef4444' }}>
            <div style={{ ...styles.summaryValue, color: '#ef4444' }}>{atRiskCount}</div>
            <div style={styles.summaryLabel}>At Risk (14+ days idle)</div>
          </div>
          <div style={{ ...styles.summaryCard, borderTop: '3px solid #10b981' }}>
            <div style={{ ...styles.summaryValue, color: '#10b981' }}>{avgCompletion}%</div>
            <div style={styles.summaryLabel}>Avg. Completion</div>
          </div>
          <div style={{ ...styles.summaryCard, borderTop: '3px solid #f59e0b' }}>
            <div style={{ ...styles.summaryValue, color: '#f59e0b' }}>{pendingRequestCount}</div>
            <div style={styles.summaryLabel}>Pending Requests</div>
          </div>
        </div>

        <div style={styles.filterRow}>
          {[
            { key: 'all', label: `All (${students.length})` },
            { key: 'at_risk', label: `⚠ At Risk (${atRiskCount})` },
            { key: 'on_track', label: `✓ On Track (${students.length - atRiskCount})` },
            { key: 'pending_request', label: `🎓 Requests (${pendingRequestCount})` },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key as any)}
              style={{ ...styles.filterBtn, ...(filter === f.key ? styles.filterBtnActive : {}) }}>
              {f.label}
            </button>
          ))}
        </div>

        <div style={styles.studentList}>
          {filtered.map(student => (
            <div key={student.user_id}
              onClick={() => handleSelectStudent(student)}
              style={{ ...styles.studentCard, ...(student.atRisk ? styles.studentCardRisk : {}), ...(selectedStudent?.user_id === student.user_id ? styles.studentCardSelected : {}), cursor: 'pointer' }}>
              <div style={styles.studentHeader}>
                <div style={styles.studentLeft}>
                  <div style={{ ...styles.avatar, background: LICENSE_COLORS[student.license_type] || '#2563eb' }}>
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <div style={styles.studentName}>
                      {student.name}
                      {student.pendingRequests > 0 && (
                        <span style={styles.requestDot}>{student.pendingRequests} request{student.pendingRequests !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <div style={styles.studentEmail}>{student.email}</div>
                  </div>
                </div>
                <div style={styles.studentRight}>
                  <span style={{ ...styles.licenseBadge, background: LICENSE_COLORS[student.license_type] + '15', color: LICENSE_COLORS[student.license_type], border: `1px solid ${LICENSE_COLORS[student.license_type]}40` }}>
                    {LICENSE_LABELS[student.license_type]}
                  </span>
                  {student.atRisk && <span style={styles.riskBadge}>⚠ {student.daysSinceLastFlight}d idle</span>}
                </div>
              </div>

              <div style={styles.progressRow}>
                <div style={styles.progressInfo}>
                  <span style={styles.progressHours}>{student.hoursLogged.toFixed(1)}h logged</span>
                  <span style={styles.progressSep}>·</span>
                  <span style={styles.progressScheduled}>{student.hoursScheduled.toFixed(1)}h scheduled</span>
                  <span style={styles.progressSep}>·</span>
                  <span style={styles.progressRequired}>{student.hoursRequired}h required</span>
                </div>
                <span style={styles.progressPct}>{student.completionPct}%</span>
              </div>
              <div style={styles.progressBarBg}>
                <div style={{ ...styles.progressBarLogged, width: `${(student.hoursLogged / student.hoursRequired) * 100}%` }} />
                <div style={{ ...styles.progressBarSched, width: `${Math.min(100 - (student.hoursLogged / student.hoursRequired) * 100, (student.hoursScheduled / student.hoursRequired) * 100)}%`, left: `${(student.hoursLogged / student.hoursRequired) * 100}%` }} />
              </div>

              <div style={styles.studentFooter}>
                <span style={styles.footerItem}>✈ {student.instructor_name}</span>
                <span style={styles.footerItem}>🛩 {student.aircraft_tail}</span>
                <span style={{ ...styles.footerItem, color: student.weeksDelta > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                  📅 {formatMonth(student.projectedGradDate)}
                  {student.weeksDelta !== 0 && (
                    <span> ({student.weeksDelta > 0 ? `+${student.weeksDelta}wk late` : `${Math.abs(student.weeksDelta)}wk early`})</span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Student detail drawer */}
      {selectedStudent && (
        <div style={styles.drawer}>
          <div style={styles.drawerHeader}>
            <div style={styles.drawerTitle}>
              <div style={{ ...styles.avatar, background: LICENSE_COLORS[selectedStudent.license_type], width: '36px', height: '36px', fontSize: '14px' }}>
                {selectedStudent.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '16px' }}>{selectedStudent.name}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{LICENSE_LABELS[selectedStudent.license_type]}</div>
              </div>
            </div>
            <button onClick={() => { setSelectedStudent(null); setStudentDetail(null); }} style={styles.closeBtn}>✕</button>
          </div>

          {detailLoading ? (
            <div style={{ padding: '40px', textAlign: 'center' as const, color: '#64748b' }}>Loading...</div>
          ) : studentDetail ? (
            <div style={styles.drawerBody}>
              {/* Graduation delta */}
              <div style={{ ...styles.gradBanner, background: selectedStudent.weeksDelta > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${selectedStudent.weeksDelta > 0 ? '#fca5a5' : '#86efac'}` }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: selectedStudent.weeksDelta > 0 ? '#dc2626' : '#15803d' }}>
                  {selectedStudent.weeksDelta > 0 ? `⚠ ${selectedStudent.weeksDelta} weeks behind schedule` : `🚀 ${Math.abs(selectedStudent.weeksDelta)} weeks ahead of schedule`}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Expected: {formatMonth(selectedStudent.expectedGradDate)} · Projected: {formatMonth(selectedStudent.projectedGradDate)}
                </div>
              </div>

              {/* Course minimums */}
              <div style={styles.drawerSection}>
                <div style={styles.drawerSectionTitle}>Course Minimums</div>
                {studentDetail.minimums.map((m, i) => (
                  <div key={i} style={styles.minimumRow}>
                    <div style={styles.minimumLabel}>{m.label}</div>
                    <div style={styles.minimumBar}>
                      <div style={styles.minimumBarBg}>
                        <div style={{ ...styles.minimumBarFill, width: `${m.pct}%`, background: m.pct >= 100 ? '#10b981' : m.pct >= 50 ? '#f59e0b' : '#2563eb' }} />
                      </div>
                      <div style={styles.minimumHours}>{m.logged.toFixed(1)}/{m.required}h</div>
                    </div>
                    <div style={{ ...styles.minimumPct, color: m.pct >= 100 ? '#10b981' : '#64748b' }}>{m.pct}%</div>
                  </div>
                ))}
              </div>

              {/* Pending requests */}
              {studentDetail.requests.filter((r: any) => r.status === 'pending_approval').length > 0 && (
                <div style={styles.drawerSection}>
                  <div style={styles.drawerSectionTitle}>Pending Schedule Requests</div>
                  {studentDetail.requests.filter((r: any) => r.status === 'pending_approval').map((req: any) => (
                    <div key={req.id} style={styles.requestCard}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                        {req.requested_hours}h requested · {(req.ai_schedule || []).length} lessons proposed
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                        Submitted {new Date(req.created_at).toLocaleDateString()}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button
                          style={styles.approveSmBtn}
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const result = await api.approveStudentRequest(req.id);
                              alert(`✅ Approved! ${result.lessonsCreated} lessons confirmed in student's calendar.`);
                              loadStudents();
                              if (selectedStudent) handleSelectStudent(selectedStudent);
                            } catch (err: any) {
                              alert('Failed to approve: ' + err.message);
                            }
                          }}
                        >✓ Approve All</button>
                        <button style={styles.declineSmBtn}>✗ Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent lessons */}
              <div style={styles.drawerSection}>
                <div style={styles.drawerSectionTitle}>Recent Lessons</div>
                {studentDetail.lessons.slice(0, 5).map((lesson, i) => (
                  <div key={i} style={styles.lessonRow}>
                    <div style={styles.lessonDate}>{formatDate(lesson.start_time)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{lesson.lesson_type}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{lesson.instructor_name} · {lesson.aircraft_tail}</div>
                    </div>
                    <div style={{ ...styles.statusDot, background: lesson.status === 'completed' ? '#10b981' : lesson.status === 'confirmed' ? '#2563eb' : '#f59e0b' }} />
                  </div>
                ))}
                {studentDetail.lessons.length === 0 && <div style={{ fontSize: '13px', color: '#94a3b8' }}>No lessons yet</div>}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: '28px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' },
  subtitle: { color: '#64748b', margin: '0 0 28px 0', fontSize: '15px' },
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' },
  summaryCard: { background: '#fff', borderRadius: '10px', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderTop: '3px solid #6366f1' },
  summaryValue: { fontSize: '32px', fontWeight: 800, color: '#6366f1', marginBottom: '4px' },
  summaryLabel: { fontSize: '13px', color: '#64748b', fontWeight: 500 },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' as const },
  filterBtn: { padding: '8px 18px', borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', color: '#475569' },
  filterBtnActive: { background: '#0f172a', color: '#fff', border: '1px solid #0f172a' },
  studentList: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
  studentCard: { background: '#fff', borderRadius: '12px', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', transition: 'all 0.15s' },
  studentCardRisk: { borderLeft: '4px solid #ef4444' },
  studentCardSelected: { boxShadow: '0 0 0 2px #2563eb', borderLeft: '4px solid #2563eb' },
  studentHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  studentLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  avatar: { width: '40px', height: '40px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '16px', flexShrink: 0 },
  studentName: { fontSize: '16px', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' },
  requestDot: { background: '#fef3c7', color: '#d97706', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', border: '1px solid #fcd34d' },
  studentEmail: { fontSize: '13px', color: '#64748b' },
  studentRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  licenseBadge: { fontSize: '12px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px' },
  riskBadge: { background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px' },
  progressRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  progressInfo: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' },
  progressHours: { color: '#10b981', fontWeight: 600 },
  progressScheduled: { color: '#2563eb', fontWeight: 600 },
  progressRequired: { color: '#94a3b8' },
  progressSep: { color: '#d1d5db' },
  progressPct: { fontSize: '15px', fontWeight: 800, color: '#0f172a' },
  progressBarBg: { height: '8px', background: '#e2e8f0', borderRadius: '4px', position: 'relative' as const, overflow: 'hidden', marginBottom: '14px' },
  progressBarLogged: { height: '100%', background: '#10b981', borderRadius: '4px', position: 'absolute' as const, left: 0 },
  progressBarSched: { height: '100%', background: '#93c5fd', position: 'absolute' as const },
  studentFooter: { display: 'flex', gap: '20px', flexWrap: 'wrap' as const },
  footerItem: { fontSize: '13px', color: '#64748b' },

  // Drawer
  drawer: { width: '380px', flexShrink: 0, background: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', height: 'fit-content', position: 'sticky' as const, top: '24px', maxHeight: '90vh', overflowY: 'auto' as const },
  drawerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 16px', borderBottom: '1px solid #f1f5f9' },
  drawerTitle: { display: 'flex', alignItems: 'center', gap: '12px' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '18px' },
  drawerBody: { padding: '16px 20px' },
  gradBanner: { borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' },
  drawerSection: { marginBottom: '20px' },
  drawerSectionTitle: { fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '12px' },
  minimumRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' },
  minimumLabel: { fontSize: '12px', color: '#475569', width: '110px', flexShrink: 0 },
  minimumBar: { flex: 1, display: 'flex', alignItems: 'center', gap: '6px' },
  minimumBarBg: { flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' },
  minimumBarFill: { height: '100%', borderRadius: '3px', transition: 'width 0.5s ease' },
  minimumHours: { fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' as const, width: '60px' },
  minimumPct: { fontSize: '11px', fontWeight: 700, width: '30px', textAlign: 'right' as const },
  requestCard: { background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px' },
  approveSmBtn: { background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  declineSmBtn: { background: '#fff', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  lessonRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f1f5f9' },
  lessonDate: { fontSize: '11px', color: '#64748b', width: '90px', flexShrink: 0 },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
};
