-- Migration 005: Add school_type to operators, at_risk_nudge suggestion type, cancellation tracking

-- Add school_type to operators
ALTER TABLE operators ADD COLUMN IF NOT EXISTS school_type TEXT NOT NULL DEFAULT 'part_141'
  CHECK (school_type IN ('part_141', 'part_61'));

-- Extend suggestions type to include at_risk_nudge
ALTER TABLE suggestions DROP CONSTRAINT IF EXISTS suggestions_type_check;
ALTER TABLE suggestions ADD CONSTRAINT suggestions_type_check
  CHECK (type IN ('waitlist', 'reschedule', 'discovery', 'next_lesson', 'at_risk_nudge'));

-- Add retry_count to suggestions so we can show agent retry visibility
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS candidates_tried INTEGER DEFAULT 0;

-- Add last_flight_date to student_profiles for at-risk tracking
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS last_flight_date DATE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS flights_last_30_days INTEGER DEFAULT 0;

-- Cancellation events tracking table
CREATE TABLE IF NOT EXISTS cancellation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  filled_by_suggestion_id UUID REFERENCES suggestions(id),
  revenue_at_risk_usd NUMERIC(10,2) DEFAULT 0,
  recovered BOOLEAN DEFAULT FALSE,
  simulated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancellation_events_operator ON cancellation_events(operator_id, created_at DESC);
