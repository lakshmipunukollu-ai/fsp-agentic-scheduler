const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
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

  // Students
  getStudentProfile: () =>
    request<{ profile: unknown; lessons: unknown[]; recentRequests: unknown[]; progress: { hoursLogged: number; hoursScheduled: number; hoursRequired: number; hoursRemaining: number; completionPct: number; paceStatus: string; paceDiff: number; projectedGradDate: string } }>('/students/profile'),

  getStudentCalendar: () =>
    request<{ lessons: unknown[] }>('/students/calendar'),

  requestSchedule: (data: { windows: { date: string; startTime: string; endTime: string }[]; goalHours: number; weekStart: string }) =>
    request<{ request: unknown; schedule: unknown[] }>('/students/request-schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAllStudents: () =>
    request<{ students: unknown[] }>('/students/all'),

  getStudentDetailForAdmin: (userId: string) =>
    request<{ profile: unknown; lessons: unknown[]; requests: unknown[]; minimums: unknown[] }>(`/students/${userId}/profile`),

  approveStudentRequest: (requestId: string) =>
    request<{ ok: boolean; lessonsCreated: number; lessons: unknown[] }>(`/students/approve-request/${requestId}`, { method: 'POST' }),

  getStudentNotifications: () =>
    request<{ notifications: unknown[] }>('/students/notifications'),

  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/students/notifications/${id}/read`, { method: 'POST' }),

  getInstructorSchedule: () =>
    request<{ lessons: unknown[]; instructorName: string }>('/students/instructor-schedule'),
};
