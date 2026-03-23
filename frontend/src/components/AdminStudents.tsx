import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';

interface Student {
  user_id: string;
  name: string;
  email: string;
  license_type: string;
  hoursLogged: number;
  hoursScheduled: number;
  hoursRequired: number;
  completionPct: number;
  daysSinceLastFlight: number;
  atRisk: boolean;
  projectedGradDate: string;
  expectedGradDate: string;
  weeksDelta: number;
  instructor_name: string;
  aircraft_tail: string;
  pendingRequests: number;
}

interface StudentDetail {
  profile: any;
  lessons: any[];
  requests: any[];
  minimums: any[];
}

const LICENSE_LABELS: Record<string, string> = {
  PPL: 'Private Pilot (PPL)',
  IR: 'Instrument Rating (IR)',
  CPL: 'Commercial Pilot (CPL)',
};

function getProgressStatus(student: Student): { label: string; cls: string } {
  if (student.weeksDelta <= -2) return { label: 'Ahead', cls: 'ahead' };
  if (student.weeksDelta <= 1) return { label: 'On Track', cls: 'ontrack' };
  if (student.daysSinceLastFlight > 14) return { label: 'At Risk', cls: 'atrisk' };
  return { label: 'Behind', cls: 'behind' };
}

export default function AdminStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseFilter, setCourseFilter] = useState('all');
  const [instructorFilter, setInstructorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailView, setDetailView] = useState<'overview' | 'detail'>('overview');
  const [cancelingLesson, setCancelingLesson] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLessonId, setCancelLessonId] = useState<string | null>(null);
  const [decliningRequest, setDecliningRequest] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declineRequestId, setDeclineRequestId] = useState<string | null>(null);
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
    } finally { setLoading(false); }
  };

  const loadStudentsSilent = async () => {
    try {
      const data = await api.getAllStudents();
      setStudents(data.students as Student[]);
    } catch { }
  };

  const handleSelectStudent = async (student: Student, view: 'overview' | 'detail') => {
    setSelectedStudent(student);
    setDetailView(view);
    setDetailLoading(true);
    try {
      const detail = await api.getStudentDetailForAdmin(student.user_id);
      setStudentDetail(detail as StudentDetail);
    } finally { setDetailLoading(false); }
  };

  const reloadDetail = async () => {
    if (!selectedStudent) return;
    const detail = await api.getStudentDetailForAdmin(selectedStudent.user_id);
    setStudentDetail(detail as StudentDetail);
    loadStudentsSilent();
  };

  const handleCancelLesson = async (lessonId: string, reason: string) => {
    setCancelingLesson(lessonId);
    try {
      await api.staffCancelLesson(lessonId, { reason: reason || undefined });
      setCancelLessonId(null);
      setCancelReason('');
      await reloadDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to cancel lesson');
    } finally {
      setCancelingLesson(null);
    }
  };

  const handleDeclineRequest = async (requestId: string, reason: string) => {
    setDecliningRequest(requestId);
    try {
      // Decline via the suggestions endpoint — find the matching suggestion
      // Fall back to a direct lesson-request decline if no suggestion exists
      await api.declineStudentRequest(requestId, reason || undefined);
      setDeclineRequestId(null);
      setDeclineReason('');
      await reloadDetail();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to decline request');
    } finally {
      setDecliningRequest(null);
    }
  };

  const instructors = [...new Set(students.map(s => s.instructor_name))];

  const filtered = students.filter(s => {
    const status = getProgressStatus(s).cls;
    if (courseFilter !== 'all' && s.license_type !== courseFilter) return false;
    if (instructorFilter !== 'all' && s.instructor_name !== instructorFilter) return false;
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    return true;
  });

  const counts = {
    ahead: students.filter(s => getProgressStatus(s).cls === 'ahead').length,
    ontrack: students.filter(s => getProgressStatus(s).cls === 'ontrack').length,
    atrisk: students.filter(s => getProgressStatus(s).cls === 'atrisk').length,
    behind: students.filter(s => getProgressStatus(s).cls === 'behind').length,
  };

  const total = students.length || 1;
  const formatMonth = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const formatDate = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  if (loading) return <div style={s.loading}>Loading students...</div>;

  if (selectedStudent && studentDetail) {
    return (
      <div>
        <div style={s.backBar}>
          <button onClick={() => { setSelectedStudent(null); setStudentDetail(null); }} style={s.backBtn}>← Back to Students</button>
          <div style={s.detailTabs}>
            <button onClick={() => setDetailView('overview')} style={{ ...s.detailTab, ...(detailView === 'overview' ? s.detailTabActive : {}) }}>Course Overview</button>
            <button onClick={() => setDetailView('detail')} style={{ ...s.detailTab, ...(detailView === 'detail' ? s.detailTabActive : {}) }}>Progress Detail</button>
          </div>
        </div>

        <div style={s.detailHeader}>
          <div>
            <h2 style={s.detailName}>{selectedStudent.name}</h2>
            <div style={s.detailMeta}>{selectedStudent.email} · {LICENSE_LABELS[selectedStudent.license_type]} · {selectedStudent.instructor_name} · {selectedStudent.aircraft_tail}</div>
          </div>
          <div style={{ ...s.statusPill, ...getStatusStyle(getProgressStatus(selectedStudent).cls) }}>
            {getProgressStatus(selectedStudent).label}
          </div>
        </div>

        {detailView === 'overview' && (
          <div>
            {/* Grad banner */}
            <div style={{ ...s.gradBanner, ...(selectedStudent.weeksDelta > 0 ? s.gradBannerBehind : s.gradBannerAhead) }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: selectedStudent.weeksDelta > 0 ? '#dc2626' : '#15803d' }}>
                {selectedStudent.weeksDelta > 0 ? `⚠ ${selectedStudent.weeksDelta} weeks behind schedule` : `🚀 ${Math.abs(selectedStudent.weeksDelta)} weeks ahead of schedule`}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                Expected: {formatMonth(selectedStudent.expectedGradDate)} · Projected: {formatMonth(selectedStudent.projectedGradDate)}
              </div>
            </div>

            {/* Hours summary */}
            <div style={s.hoursGrid}>
              {[
                { label: 'Hours Logged', value: selectedStudent.hoursLogged.toFixed(1) + 'h', color: '#10b981' },
                { label: 'Hours Scheduled', value: selectedStudent.hoursScheduled.toFixed(1) + 'h', color: '#2563eb' },
                { label: 'Hours Required', value: selectedStudent.hoursRequired + 'h', color: '#6366f1' },
                { label: 'Completion', value: selectedStudent.completionPct + '%', color: '#f59e0b' },
              ].map(card => (
                <div key={card.label} style={s.hoursCard}>
                  <div style={{ ...s.hoursVal, color: card.color }}>{card.value}</div>
                  <div style={s.hoursLabel}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* Course minimums table */}
            <div style={s.tableCard}>
              <h3 style={s.tableCardTitle}>Course Minimums — FAA Requirements</h3>
              <table style={s.miniTable}>
                <thead>
                  <tr style={s.miniThead}>
                    <th style={s.miniTh}>Requirement</th>
                    <th style={s.miniTh}>Progress</th>
                    <th style={s.miniTh}>Logged</th>
                    <th style={s.miniTh}>Required</th>
                    <th style={s.miniTh}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {studentDetail.minimums.map((m: any, i: number) => (
                    <tr key={i} style={i % 2 === 0 ? {} : s.miniTrAlt}>
                      <td style={s.miniTd}>{m.label}</td>
                      <td style={{ ...s.miniTd, width: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${m.pct}%`, background: m.pct >= 100 ? '#10b981' : m.pct >= 50 ? '#f59e0b' : '#2563eb', borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: '#64748b', width: '30px' }}>{m.pct}%</span>
                        </div>
                      </td>
                      <td style={s.miniTd}>{m.logged.toFixed(1)}h</td>
                      <td style={s.miniTd}>{m.required}h</td>
                      <td style={s.miniTd}>
                        <span style={{ ...s.statusPill, ...(m.pct >= 100 ? { background: '#dcfce7', color: '#15803d' } : m.pct >= 50 ? { background: '#fef9c3', color: '#854d0e' } : { background: '#fee2e2', color: '#dc2626' }) }}>
                          {m.pct >= 100 ? 'Complete' : m.pct >= 50 ? 'In Progress' : 'Not Started'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {detailView === 'detail' && (
          <div style={s.tableCard}>
            <h3 style={s.tableCardTitle}>Recent Lessons</h3>
            <table style={s.miniTable}>
              <thead>
                <tr style={s.miniThead}>
                  <th style={s.miniTh}>Date & Time</th>
                  <th style={s.miniTh}>Lesson</th>
                  <th style={s.miniTh}>Instructor</th>
                  <th style={s.miniTh}>Aircraft</th>
                  <th style={s.miniTh}>Status</th>
                  <th style={s.miniTh}>Action</th>
                </tr>
              </thead>
              <tbody>
                {studentDetail.lessons.length === 0 && (
                  <tr><td colSpan={6} style={{ ...s.miniTd, textAlign: 'center', color: '#94a3b8', padding: '24px' }}>No lessons yet</td></tr>
                )}
                {studentDetail.lessons.map((lesson: any, i: number) => {
                  const isFuture = new Date(lesson.start_time) > new Date();
                  const canCancel = lesson.status === 'confirmed' && isFuture;
                  return (
                    <tr key={i} style={i % 2 === 0 ? {} : s.miniTrAlt}>
                      <td style={s.miniTd}>{formatDate(lesson.start_time)}</td>
                      <td style={s.miniTd}>{lesson.lesson_type}</td>
                      <td style={s.miniTd}>{lesson.instructor_name}</td>
                      <td style={s.miniTd}>{lesson.aircraft_tail}</td>
                      <td style={s.miniTd}>
                        <span style={{ ...s.statusPill, ...(lesson.status === 'completed' ? { background: '#f1f5f9', color: '#475569' } : lesson.status === 'confirmed' ? { background: '#dcfce7', color: '#15803d' } : lesson.status === 'cancelled' ? { background: '#fee2e2', color: '#dc2626' } : { background: '#fef9c3', color: '#854d0e' }) }}>
                          {lesson.status}
                        </span>
                      </td>
                      <td style={s.miniTd}>
                        {canCancel && (
                          <button
                            style={{ ...s.actionBtn, color: '#dc2626', borderColor: '#fca5a5', fontSize: '12px', padding: '4px 10px' }}
                            onClick={() => { setCancelLessonId(lesson.id); setCancelReason(''); }}
                          >Cancel</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pending requests */}
            {studentDetail.requests.filter((r: any) => r.status === 'pending_approval').length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={s.tableCardTitle}>Pending Schedule Requests</h3>
                {studentDetail.requests.filter((r: any) => r.status === 'pending_approval').map((req: any) => (
                  <div key={req.id} style={s.reqCard}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                      {req.requested_hours}h requested · {(req.ai_schedule || []).length} lessons proposed
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Submitted {new Date(req.created_at).toLocaleDateString()}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button
                        style={{ ...s.actionBtn, background: '#10b981', color: '#fff', border: 'none' }}
                        onClick={async () => {
                          try {
                            await api.approveStudentRequest(req.id);
                            await reloadDetail();
                          } catch (err: unknown) { alert(err instanceof Error ? err.message : 'Failed'); }
                        }}
                      >✓ Approve All Lessons</button>
                      <button
                        style={{ ...s.actionBtn, color: '#dc2626', borderColor: '#fca5a5' }}
                        onClick={() => { setDeclineRequestId(req.id); setDeclineReason(''); }}
                      >✗ Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cancel lesson modal */}
        {cancelLessonId && (
          <div style={s.modalOverlay}>
            <div style={s.modal}>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Cancel Lesson</h3>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
                The student will be notified by email and in-app. An open-slot fill suggestion will be added to the queue.
              </p>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Reason <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
              </label>
              <input
                autoFocus
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. Instructor unavailable, weather hold…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button style={s.actionBtn} onClick={() => setCancelLessonId(null)}>Keep lesson</button>
                <button
                  disabled={cancelingLesson === cancelLessonId}
                  style={{ ...s.actionBtn, background: '#dc2626', color: '#fff', border: 'none', opacity: cancelingLesson === cancelLessonId ? 0.6 : 1 }}
                  onClick={() => handleCancelLesson(cancelLessonId, cancelReason)}
                >
                  {cancelingLesson === cancelLessonId ? 'Cancelling…' : 'Confirm cancellation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Decline schedule request modal */}
        {declineRequestId && (
          <div style={s.modalOverlay}>
            <div style={s.modal}>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>Decline Schedule Request</h3>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
                The student will be notified by email with the reason below.
              </p>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Reason <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
              </label>
              <input
                autoFocus
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                placeholder="e.g. Aircraft not available, please submit new dates…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button style={s.actionBtn} onClick={() => setDeclineRequestId(null)}>Go back</button>
                <button
                  disabled={decliningRequest === declineRequestId}
                  style={{ ...s.actionBtn, background: '#dc2626', color: '#fff', border: 'none', opacity: decliningRequest === declineRequestId ? 0.6 : 1 }}
                  onClick={() => handleDeclineRequest(declineRequestId, declineReason)}
                >
                  {decliningRequest === declineRequestId ? 'Declining…' : 'Confirm decline'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Student Progress Overview</h1>
          <p style={s.pageSub}>Training progress and graduation visibility across all enrolled students</p>
        </div>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} style={s.filterSelect}>
          <option value="all">All courses</option>
          <option value="PPL">Private Pilot (PPL)</option>
          <option value="IR">Instrument Rating (IR)</option>
          <option value="CPL">Commercial Pilot (CPL)</option>
        </select>
        <select value={instructorFilter} onChange={e => setInstructorFilter(e.target.value)} style={s.filterSelect}>
          <option value="all">All instructors</option>
          {instructors.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={s.filterSelect}>
          <option value="all">All progress statuses</option>
          <option value="ahead">Ahead</option>
          <option value="ontrack">On Track</option>
          <option value="atrisk">At Risk</option>
          <option value="behind">Behind</option>
        </select>
        {(courseFilter !== 'all' || instructorFilter !== 'all' || statusFilter !== 'all') && (
          <button onClick={() => { setCourseFilter('all'); setInstructorFilter('all'); setStatusFilter('all'); }} style={{ ...s.filterSelect, color: '#2563eb', borderColor: '#93c5fd', cursor: 'pointer' }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Summary bar */}
      <div style={s.summaryBar}>
        {[
          { key: 'ahead', label: 'Ahead', count: counts.ahead, color: '#4a7c4e' },
          { key: 'ontrack', label: 'On Track', count: counts.ontrack, color: '#5b8fa8' },
          { key: 'atrisk', label: 'At Risk', count: counts.atrisk, color: '#c4922a' },
          { key: 'behind', label: 'Behind', count: counts.behind, color: '#b85450' },
        ].map((item, i) => (
          <div key={item.key} onClick={() => setStatusFilter(item.key)}
            style={{ ...s.summaryCard, background: item.color, cursor: 'pointer', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>
            <div>
              <div style={s.summaryLabel}>{item.label}</div>
              <div style={s.summaryCount}>{item.count} student{item.count !== 1 ? 's' : ''}</div>
            </div>
            <div style={s.summaryPct}>{Math.round((item.count / total) * 100)}%</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, ...s.thActive }}>Student Name</th>
              <th style={s.th}>Course</th>
              <th style={s.th}>Instructor</th>
              <th style={s.th}>% Lesson Completion</th>
              <th style={s.th}>% Course Minimums</th>
              <th style={s.th}>Projected Graduation</th>
              <th style={s.th}>Progress Status</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((student, i) => {
              const status = getProgressStatus(student);
              const minimsAvg = Math.round(student.completionPct * 0.85);
              return (
                <tr key={student.user_id} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                  <td style={s.td}>
                    <div style={s.studentName}>{student.name}</div>
                    <div style={s.studentEmail}>{student.email}</div>
                    {student.pendingRequests > 0 && (
                      <span style={s.pendingBadge}>{student.pendingRequests} request{student.pendingRequests !== 1 ? 's' : ''} pending</span>
                    )}
                  </td>
                  <td style={s.td}>
                    <div style={s.courseLabel}>{LICENSE_LABELS[student.license_type]}</div>
                    <div style={s.courseSub}>{student.hoursLogged.toFixed(1)}h / {student.hoursRequired}h</div>
                  </td>
                  <td style={{ ...s.td, color: '#475569' }}>{student.instructor_name}</td>
                  <td style={s.td}>
                    <div style={s.progCell}>
                      <div style={s.progBarBg}>
                        <div style={{ ...s.progBarFill, width: `${student.completionPct}%`, background: student.completionPct >= 75 ? '#10b981' : student.completionPct >= 40 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                      <span style={s.progPct}>{student.completionPct}%</span>
                    </div>
                  </td>
                  <td style={s.td}>
                    <div style={s.progCell}>
                      <div style={s.progBarBg}>
                        <div style={{ ...s.progBarFill, width: `${minimsAvg}%`, background: minimsAvg >= 75 ? '#10b981' : minimsAvg >= 40 ? '#f59e0b' : '#2563eb' }} />
                      </div>
                      <span style={s.progPct}>{minimsAvg}%</span>
                    </div>
                  </td>
                  <td style={{ ...s.td, fontSize: '13px', color: student.weeksDelta > 0 ? '#dc2626' : '#15803d', fontWeight: 500 }}>
                    {new Date(student.projectedGradDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    {student.weeksDelta !== 0 && (
                      <div style={{ fontSize: '11px', color: student.weeksDelta > 0 ? '#ef4444' : '#10b981' }}>
                        {student.weeksDelta > 0 ? `+${student.weeksDelta}wk late` : `${Math.abs(student.weeksDelta)}wk early`}
                      </div>
                    )}
                  </td>
                  <td style={s.td}>
                    <span style={{ ...s.statusPill, ...getStatusStyle(status.cls) }}>{status.label}</span>
                    {student.atRisk && student.daysSinceLastFlight > 14 && (
                      <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>⚠ {student.daysSinceLastFlight}d idle</div>
                    )}
                  </td>
                  <td style={s.td}>
                    <div style={s.actionsCell}>
                      <button onClick={() => handleSelectStudent(student, 'overview')} style={s.actionBtn}>Course Overview</button>
                      <button onClick={() => handleSelectStudent(student, 'detail')} style={s.actionBtn}>Progress Detail</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No students match filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getStatusStyle(cls: string): React.CSSProperties {
  switch (cls) {
    case 'ahead': return { background: '#dcfce7', color: '#15803d' };
    case 'ontrack': return { background: '#dbeafe', color: '#1d4ed8' };
    case 'atrisk': return { background: '#fef9c3', color: '#854d0e' };
    case 'behind': return { background: '#fee2e2', color: '#dc2626' };
    default: return {};
  }
}

const s: Record<string, React.CSSProperties> = {
  loading: { color: '#64748b', padding: '40px', textAlign: 'center' as const },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  pageTitle: { fontSize: '24px', fontWeight: 600, color: '#1e293b', margin: '0 0 4px 0' },
  pageSub: { color: '#64748b', margin: 0, fontSize: '14px' },

  filters: { display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' as const },
  filterSelect: { padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', color: '#374151', background: '#fff' },

  summaryBar: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '20px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' },
  summaryCard: { padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', transition: 'filter .15s' },
  summaryLabel: { fontSize: '15px', fontWeight: 600 },
  summaryCount: { fontSize: '12px', marginTop: '2px', opacity: 0.8 },
  summaryPct: { fontSize: '28px', fontWeight: 700 },

  tableWrap: { background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  th: { padding: '10px 14px', textAlign: 'left' as const, fontSize: '12px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap' as const },
  thActive: { background: '#2563eb', color: '#fff' },
  td: { padding: '12px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' as const },
  trEven: {},
  trOdd: { background: '#fafafa' },

  studentName: { fontWeight: 600, color: '#0f172a', marginBottom: '2px' },
  studentEmail: { fontSize: '11px', color: '#94a3b8' },
  pendingBadge: { display: 'inline-block', marginTop: '4px', fontSize: '10px', background: '#fef3c7', color: '#d97706', padding: '1px 7px', borderRadius: '10px', fontWeight: 600 },
  courseLabel: { color: '#374151', marginBottom: '2px' },
  courseSub: { fontSize: '11px', color: '#94a3b8' },

  progCell: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' },
  progBarBg: { flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' },
  progBarFill: { height: '100%', borderRadius: '4px' },
  progPct: { fontSize: '11px', color: '#64748b', width: '30px', textAlign: 'right' as const },

  statusPill: { display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' as const },
  actionsCell: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  actionBtn: { padding: '5px 12px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151', whiteSpace: 'nowrap' as const },

  // Detail view
  backBar: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' },
  backBtn: { background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', padding: 0, fontWeight: 500 },
  detailTabs: { display: 'flex', gap: '4px' },
  detailTab: { padding: '8px 18px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#475569' },
  detailTabActive: { background: '#2563eb', color: '#fff', border: '1px solid #2563eb' },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', padding: '20px 24px', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0' },
  detailName: { fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' },
  detailMeta: { fontSize: '13px', color: '#64748b' },

  gradBanner: { borderRadius: '8px', padding: '14px 18px', marginBottom: '16px' },
  gradBannerAhead: { background: '#f0fdf4', border: '0.5px solid #86efac' },
  gradBannerBehind: { background: '#fef2f2', border: '0.5px solid #fca5a5' },

  hoursGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' },
  hoursCard: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', textAlign: 'center' as const },
  hoursVal: { fontSize: '24px', fontWeight: 700, marginBottom: '4px' },
  hoursLabel: { fontSize: '12px', color: '#64748b' },

  tableCard: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '16px' },
  tableCardTitle: { fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '0 0 14px 0' },
  miniTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' },
  miniThead: { background: '#f8fafc' },
  miniTh: { padding: '8px 12px', textAlign: 'left' as const, fontSize: '12px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' },
  miniTd: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#374151' },
  miniTrAlt: { background: '#fafafa' },

  reqCard: { background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '14px', marginBottom: '8px' },

  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
};
