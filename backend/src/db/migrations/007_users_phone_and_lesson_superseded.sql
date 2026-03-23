-- Staff SMS: optional phone on user accounts (E.164, e.g. +15551234567)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN users.phone IS 'Optional E.164 mobile for Twilio alerts to admin/dispatcher';

-- Single active draft: older pending requests become superseded when student generates a new schedule
ALTER TABLE lesson_requests DROP CONSTRAINT IF EXISTS lesson_requests_status_check;
ALTER TABLE lesson_requests ADD CONSTRAINT lesson_requests_status_check
  CHECK (status IN ('pending_approval', 'approved', 'declined', 'partial', 'superseded'));
