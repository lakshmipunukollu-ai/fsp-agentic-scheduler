-- Add an optional notification delivery email separate from the login email.
-- When set, all transactional emails go here instead of users.email.
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email text;
