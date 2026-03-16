-- Student portal: profiles, availability, lesson requests, scheduled lessons

-- Allow student role (drop and recreate role check if exists)
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'scheduler';

-- Student profiles (one per student user)
CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id),
  license_type TEXT NOT NULL DEFAULT 'PPL' CHECK (license_type IN ('PPL', 'IR', 'CPL')),
  hours_logged DECIMAL(8,1) DEFAULT 0,
  hours_scheduled DECIMAL(8,1) DEFAULT 0,
  hours_required DECIMAL(8,1) DEFAULT 70,
  lessons_per_week_target INTEGER DEFAULT 2,
  instructor_id TEXT DEFAULT 'INS-201',
  instructor_name TEXT DEFAULT 'Capt. Sarah Johnson',
  aircraft_tail TEXT DEFAULT 'N12345',
  program_start_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_user ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_operator ON student_profiles(operator_id);

-- Student availability windows (submitted per request)
CREATE TABLE IF NOT EXISTS student_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id),
  week_start DATE NOT NULL,
  windows JSONB NOT NULL DEFAULT '[]',
  goal_hours DECIMAL(4,1) NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_user ON student_availability(user_id, week_start);

-- Lesson requests (AI-generated schedule proposals)
CREATE TABLE IF NOT EXISTS lesson_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id),
  availability_id UUID REFERENCES student_availability(id),
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'declined', 'partial')),
  requested_hours DECIMAL(4,1) NOT NULL,
  ai_schedule JSONB NOT NULL DEFAULT '[]',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_requests_user ON lesson_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_requests_operator ON lesson_requests(operator_id, status);

-- Scheduled lessons (confirmed bookings)
CREATE TABLE IF NOT EXISTS scheduled_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id),
  lesson_request_id UUID REFERENCES lesson_requests(id),
  suggestion_id UUID REFERENCES suggestions(id),
  lesson_type TEXT NOT NULL,
  instructor_name TEXT NOT NULL,
  aircraft_tail TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('proposed', 'confirmed', 'completed', 'cancelled')),
  duration_hours DECIMAL(4,1) DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_lessons_user ON scheduled_lessons(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_scheduled_lessons_operator ON scheduled_lessons(operator_id);

ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_user_id_unique UNIQUE (user_id);
