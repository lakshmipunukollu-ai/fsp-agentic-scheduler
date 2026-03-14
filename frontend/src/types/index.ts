export type SuggestionType = 'waitlist' | 'reschedule' | 'discovery' | 'next_lesson';
export type SuggestionStatus = 'pending' | 'approved' | 'declined' | 'expired';
export type UserRole = 'admin' | 'scheduler' | 'viewer';

export interface User {
  id: string;
  operatorId: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Suggestion {
  id: string;
  operator_id: string;
  type: SuggestionType;
  status: SuggestionStatus;
  priority: number;
  payload: SuggestionPayload;
  rationale: SuggestionRationale;
  fsp_reservation_id?: string;
  expires_at?: string;
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

export interface SuggestionPayload {
  studentId: string;
  studentName: string;
  instructorId?: string;
  instructorName?: string;
  aircraftId?: string;
  aircraftTail?: string;
  startTime: string;
  endTime: string;
  lessonType?: string;
  locationId?: string;
}

export interface SuggestionRationale {
  trigger: string;
  candidateScore: CandidateScore[];
  constraintsEvaluated: string[];
  alternativesConsidered: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface CandidateScore {
  studentId: string;
  name: string;
  score: number;
  signals: {
    daysSinceLastFlight: number;
    daysUntilNextFlight: number;
    totalFlightHours: number;
    customWeights: Record<string, number>;
  };
}

export interface AuditEntry {
  id: string;
  operator_id: string;
  suggestion_id?: string;
  event_type: string;
  actor: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface OperatorConfig {
  priorityWeights: {
    daysSinceLastFlight: number;
    daysUntilNextFlight: number;
    totalFlightHours: number;
    waitlistPosition: number;
  };
  suggestionsPerOpening: number;
  searchWindowDays: number;
  expirationHours: number;
}

export interface FeatureFlags {
  waitlist_automation: boolean;
  reschedule_on_cancellation: boolean;
  discovery_flight_booking: boolean;
  auto_approve_low_risk: boolean;
}

export interface DashboardStats {
  pending: number;
  approvedToday: number;
  declinedToday: number;
  avgResponseTime: number;
  suggestionsByType: Record<string, number>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
