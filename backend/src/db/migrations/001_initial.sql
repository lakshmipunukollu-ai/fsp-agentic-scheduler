-- Initial migration: operators, users, suggestions, audit_log, schedule_events

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fsp_operator_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  feature_flags JSONB DEFAULT '{"waitlist_automation": true, "reschedule_on_cancellation": false, "discovery_flight_booking": false, "auto_approve_low_risk": false}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'scheduler',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  type TEXT NOT NULL CHECK (type IN ('waitlist', 'reschedule', 'discovery', 'next_lesson')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
  priority INTEGER DEFAULT 0,
  payload JSONB NOT NULL,
  rationale JSONB NOT NULL,
  fsp_reservation_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_suggestions_operator_status ON suggestions(operator_id, status);
CREATE INDEX IF NOT EXISTS idx_suggestions_created ON suggestions(created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  suggestion_id UUID REFERENCES suggestions(id),
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_operator ON audit_log(operator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_suggestion ON audit_log(suggestion_id);

CREATE TABLE IF NOT EXISTS schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  fsp_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_events_unprocessed ON schedule_events(operator_id, processed) WHERE NOT processed;
