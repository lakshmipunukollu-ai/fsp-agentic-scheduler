-- Migration 006: Add notification_preferences to student_profiles

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS notification_sms BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_email BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_in_app BOOLEAN DEFAULT true;
