-- Clean slate: drop all tables that may have been created with a different
-- schema outside the migration system, then let 001+ recreate them properly.
-- The seed repopulates all demo data on startup.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop in reverse dependency order
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS scheduled_lessons CASCADE;
DROP TABLE IF EXISTS lesson_requests CASCADE;
DROP TABLE IF EXISTS student_availability CASCADE;
DROP TABLE IF EXISTS student_profiles CASCADE;
DROP TABLE IF EXISTS cancellation_events CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS schedule_events CASCADE;
DROP TABLE IF EXISTS suggestions CASCADE;
DROP TABLE IF EXISTS course_minimums CASCADE;
DROP VIEW IF EXISTS pending_student_requests CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS operators CASCADE;
