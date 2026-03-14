export interface Operator {
  id: string;
  fsp_operator_id: string;
  name: string;
  config: OperatorConfig;
  feature_flags: FeatureFlags;
  created_at: string;
  updated_at: string;
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

export type SuggestionType = 'waitlist' | 'reschedule' | 'discovery' | 'next_lesson';
export type SuggestionStatus = 'pending' | 'approved' | 'declined' | 'expired';
export type UserRole = 'admin' | 'scheduler' | 'viewer';

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

export interface User {
  id: string;
  operator_id: string;
  email: string;
  password_hash?: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface ScheduleEvent {
  id: string;
  operator_id: string;
  fsp_event_id: string;
  event_type: 'cancellation' | 'completion' | 'new_booking' | 'waitlist_add';
  event_data: Record<string, unknown>;
  processed: boolean;
  created_at: string;
}

export interface ScheduleOpening {
  locationId: string;
  instructorId: string;
  aircraftId: string;
  startTime: string;
  endTime: string;
  lessonType: string;
  timeWindow: { start: string; end: string };
}

export interface AuthPayload {
  sub: string;
  role: UserRole;
  operatorId: string;
  exp: number;
}

export const DEFAULT_OPERATOR_CONFIG: OperatorConfig = {
  priorityWeights: {
    daysSinceLastFlight: 0.3,
    daysUntilNextFlight: 0.2,
    totalFlightHours: 0.1,
    waitlistPosition: 0.4,
  },
  suggestionsPerOpening: 3,
  searchWindowDays: 7,
  expirationHours: 24,
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  waitlist_automation: true,
  reschedule_on_cancellation: false,
  discovery_flight_booking: false,
  auto_approve_low_risk: false,
};
