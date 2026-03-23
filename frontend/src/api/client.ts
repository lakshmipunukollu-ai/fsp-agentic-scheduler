function resolveApiBase(): string {
  if (import.meta.env.VITE_API_URL) return `${import.meta.env.VITE_API_URL}/api`;
  if (typeof window !== 'undefined' && window.location.hostname.includes('fsp-frontend-production')) {
    return 'https://fsp-agentic-scheduler-production.up.railway.app/api';
  }
  return '/api';
}
const API_BASE = resolveApiBase();

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(path: string, options: RequestInit = {}, explicitToken?: string): Promise<T> {
  const token = explicitToken ?? getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));

    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; name: string; email: string; role: string; operatorId: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, name: string, operatorId: string) =>
    request<{ token: string; user: { id: string; name: string; email: string; role: string; operatorId: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, operatorId }),
    }),

  // Suggestions
  getSuggestions: (params?: { status?: string; type?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.type) searchParams.set('type', params.type);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return request<{ data: unknown[]; total: number; page: number; limit: number }>(`/suggestions${qs ? `?${qs}` : ''}`);
  },

  getSuggestion: (id: string) =>
    request<{ data: unknown }>(`/suggestions/${id}`),

  approveSuggestion: (id: string, notes?: string) =>
    request<{ data: unknown }>(`/suggestions/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  declineSuggestion: (id: string, reason?: string) =>
    request<{ data: unknown }>(`/suggestions/${id}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  bulkApprove: (ids: string[]) =>
    request<{ approved: number; failed: string[] }>('/suggestions/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkDecline: (ids: string[], reason?: string) =>
    request<{ declined: number; failed: string[] }>('/suggestions/bulk-decline', {
      method: 'POST',
      body: JSON.stringify({ ids, reason }),
    }),

  // Dashboard
  getDashboardStats: () =>
    request<{
      pending: number;
      approvedToday: number;
      declinedToday: number;
      avgResponseTime: number;
      suggestionsByType: Record<string, number>;
      aircraftFillRate: number;
      slotsFilledByAgent: number;
      timeSavedHours: number;
      revenueRecovered: number;
      atRiskStudentCount: number;
      pendingStudentRequests: number;
      utilization: {
        current: number;
        proposed: number;
        bookedSlots: number;
        activeAircraft: number;
        activeInstructors: number;
      };
    }>('/dashboard/stats'),

  // Audit Log
  getAuditLog: (params?: { suggestion_id?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.suggestion_id) searchParams.set('suggestion_id', params.suggestion_id);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return request<{ data: unknown[]; total: number }>(`/audit-log${qs ? `?${qs}` : ''}`);
  },

  getAuditTodaySummary: () =>
    request<{ total: number; byType: Record<string, number> }>('/audit-log/today-summary'),

  // Operators
  getOperatorConfig: (id: string) =>
    request<{ data: unknown }>(`/operators/${id}/config`),

  updateOperatorConfig: (id: string, config: unknown) =>
    request<{ data: unknown }>(`/operators/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  getFeatureFlags: (id: string) =>
    request<{ data: unknown }>(`/operators/${id}/feature-flags`),

  updateFeatureFlags: (id: string, flags: unknown) =>
    request<{ data: unknown }>(`/operators/${id}/feature-flags`, {
      method: 'PUT',
      body: JSON.stringify(flags),
    }),

  // Agent
  runAgent: () =>
    request<{ created: number; suggestions: unknown[] }>('/agent/run', {
      method: 'POST',
    }),

  getDeclineExplanation: (suggestionId: string) =>
    request<{ explanation: string }>('/agent/decline-explanation', {
      method: 'POST',
      body: JSON.stringify({ suggestionId }),
    }),

  // Insights / analytics
  getInsights: () =>
    request<{
      overallAcceptanceRate: number;
      totalApproved: number;
      totalDeclined: number;
      byType: Array<{ type: string; approved: string; declined: string; total: string; acceptance_rate: string }>;
      byConfidence: Array<{ confidence: string; approved: string; declined: string; total: string; acceptance_rate: string }>;
      topDeclineReasons: Array<{ reason: string; count: string }>;
      dailyTrend: Array<{ day: string; approved: string; declined: string; rate: string }>;
    }>('/insights'),

  // Bulk approve high confidence
  approveHighConfidence: () =>
    request<{ approved: number; failed: string[] }>('/suggestions/bulk-approve-high-confidence', {
      method: 'POST',
    }),

  // Students
  getStudentProfile: () =>
    request<{ profile: unknown; lessons: unknown[]; recentRequests: unknown[]; progress: { hoursLogged: number; hoursScheduled: number; hoursRequired: number; hoursRemaining: number; completionPct: number; paceStatus: string; paceDiff: number; projectedGradDate: string } }>('/students/profile'),

  getStudentCalendar: () =>
    request<{ lessons: unknown[] }>('/students/calendar'),

  requestSchedule: (data: {
    windows: { date: string; startTime: string; endTime: string }[];
    goalHours: number;
    weekStart: string;
    horizonDays?: number;
    rangeStartOffset?: number;
  }) =>
    request<{ request: { id: string }; schedule: unknown[] }>('/students/request-schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  submitLessonRequestSchedule: (requestId: string, data: { aiSchedule: unknown[] }) =>
    request<{ ok: boolean; suggestionId: string | null }>(`/students/lesson-requests/${requestId}/submit`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  saveLessonRequestDraft: (requestId: string, data: { aiSchedule: unknown[] }) =>
    request<{ ok: boolean; unchanged?: boolean }>(`/students/lesson-requests/${requestId}/draft`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  cancelStudentLesson: (lessonId: string, data?: { reason?: string }) =>
    request<{ ok: boolean; suggestionId: string | null; message: string }>(`/students/lessons/${lessonId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),

  getAllStudents: () =>
    request<{ students: unknown[] }>('/students/all'),

  getStudentDetailForAdmin: (userId: string) =>
    request<{ profile: unknown; lessons: unknown[]; requests: unknown[]; minimums: unknown[] }>(`/students/${userId}/profile`),

  approveStudentRequest: (requestId: string) =>
    request<{ ok: boolean; lessonsCreated: number; lessons: unknown[] }>(`/students/approve-request/${requestId}`, { method: 'POST' }),

  staffCancelLesson: (lessonId: string, data?: { reason?: string }) =>
    request<{ ok: boolean; suggestionId: string | null; message: string }>(`/students/staff/lessons/${lessonId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),

  declineStudentRequest: (requestId: string, reason?: string) =>
    request<{ ok: boolean }>(`/students/decline-request/${requestId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getStudentNotifications: () =>
    request<{ notifications: unknown[] }>('/students/notifications'),

  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/students/notifications/${id}/read`, { method: 'POST' }),

  getInstructorSchedule: () =>
    request<{ lessons: unknown[]; instructorName: string }>('/students/instructor-schedule'),

  // Analysis
  getGraduationRisk: () =>
    request<{
      data: Array<{
        user_id: string; name: string; email: string; license_type: string;
        hours_logged: number; hours_required: number;
        flights_last_30_days: number; last_flight_date: string | null;
        days_since_last_flight: number; flights_per_week: number;
        projected_graduation_hours: number; extra_hours: number;
        extra_cost_usd: number; risk_level: 'green' | 'yellow' | 'red';
      }>;
      avg_lesson_price_usd: number;
    }>('/analysis/graduation-risk'),

  getRevenueBreakdown: () =>
    request<{
      opportunity_found_usd: number; revenue_recovered_usd: number;
      revenue_at_risk_usd: number; revenue_lost_cancellations_usd: number;
      projected_loss_at_risk_students_usd: number; avg_lesson_price_usd: number; period_days: number;
    }>('/analysis/revenue-breakdown'),

  getCancellationStats: () =>
    request<{
      total_cancellations: number; filled_by_agent: number; recovery_rate_pct: number;
      revenue_recovered_usd: number; revenue_still_at_risk_usd: number;
      without_agent: { recovery_rate_pct: number; revenue_recovered_usd: number; avg_fill_time_hours: number | null };
      with_agent: { recovery_rate_pct: number; revenue_recovered_usd: number; avg_fill_time_hours: number | null };
    }>('/analysis/cancellation-stats'),

  simulateCancellation: () =>
    request<{ cancellation: unknown; suggestion: unknown; message: string }>('/analysis/simulate-cancellation', {
      method: 'POST',
    }),

  getAtRiskStudents: () =>
    request<{
      data: Array<{
        user_id: string; name: string; email: string; license_type: string;
        hours_logged: number; hours_required: number;
        flights_last_30_days: number; last_flight_date: string | null;
        days_since_last_flight: number;
      }>;
      threshold_days: number;
    }>('/analysis/at-risk-students'),

  nudgeStudent: (params: { userId: string; studentName: string; licenseType?: string; daysSinceLastFlight?: number; hoursLogged?: number }) =>
    request<{ data: unknown }>('/analysis/nudge-student', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  getAgentNarrative: () =>
    request<{
      narrative: string;
      cached: boolean;
      stats: { openings_evaluated?: number; suggestions_created: number; approved: number; declined: number; pending: number; revenue_recovered_usd: number };
    }>('/analysis/agent-narrative'),

  getLastAgentRun: () =>
    request<{ last_run_at: string | null }>('/analysis/last-agent-run'),

  getFrequencyLeaderboard: () =>
    request<{
      data: Array<{
        rank: number; name: string; license_type: string;
        hours_logged: number; hours_required: number;
        flights_last_30_days: number; flights_per_week: number;
        last_flight_date: string | null; pace_status: 'on_track' | 'behind' | 'at_risk';
      }>;
    }>('/analysis/frequency-leaderboard'),

  getSchoolType: () =>
    request<{ school_type: 'part_141' | 'part_61' }>('/analysis/operator-school-type'),

  setSchoolType: (school_type: 'part_141' | 'part_61') =>
    request<{ school_type: string }>('/analysis/operator-school-type', {
      method: 'PATCH',
      body: JSON.stringify({ school_type }),
    }),

  // Student notification preferences (persisted to DB)
  getNotificationPrefs: () =>
    request<{ sms: boolean; email: boolean; in_app: boolean }>('/students/notification-prefs'),

  setNotificationPrefs: (prefs: { sms?: boolean; email?: boolean; in_app?: boolean }) =>
    request<{ ok: boolean }>('/students/notification-prefs', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    }),

  getMyContact: () =>
    request<{ email: string; phone: string | null; name: string }>('/me/contact'),

  patchMyContact: (body: { email?: string; phone?: string | null }) =>
    request<{ email: string; phone: string | null }>('/me/contact', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  setContactEmail: (contact_email: string | null) =>
    request<{ ok: boolean; contact_email: string | null }>('/students/contact-email', {
      method: 'PATCH',
      body: JSON.stringify({ contact_email }),
    }),
};
