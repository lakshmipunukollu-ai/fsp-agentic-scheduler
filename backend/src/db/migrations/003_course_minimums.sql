CREATE TABLE IF NOT EXISTS course_minimums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_type TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  hours_required DECIMAL(6,1) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(license_type, category)
);

INSERT INTO course_minimums (license_type, category, label, hours_required, sort_order) VALUES
  ('PPL', 'ground', 'Ground Instruction', 20.0, 1),
  ('PPL', 'flight', 'Flight Instruction', 40.0, 2),
  ('PPL', 'solo', 'Solo Flight Time', 10.0, 3),
  ('PPL', 'cross_country', 'Cross-Country', 3.0, 4),
  ('IR', 'ground', 'Ground Instruction', 15.0, 1),
  ('IR', 'flight', 'Instrument Flight', 50.0, 2),
  ('IR', 'cross_country', 'Cross-Country PIC', 50.0, 3),
  ('IR', 'sim', 'Simulator Time', 20.0, 4),
  ('CPL', 'ground', 'Ground Instruction', 25.0, 1),
  ('CPL', 'flight', 'Total Flight Time', 250.0, 2),
  ('CPL', 'pic', 'PIC Time', 100.0, 3),
  ('CPL', 'cross_country', 'Cross-Country PIC', 50.0, 4),
  ('CPL', 'night', 'Night Flight', 10.0, 5)
ON CONFLICT (license_type, category) DO NOTHING;

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS hours_ground DECIMAL(6,1) DEFAULT 0;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS hours_solo DECIMAL(6,1) DEFAULT 0;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS hours_cross_country DECIMAL(6,1) DEFAULT 0;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS hours_night DECIMAL(6,1) DEFAULT 0;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS hours_sim DECIMAL(6,1) DEFAULT 0;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS expected_grad_date DATE;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS contract_hours DECIMAL(6,1);

CREATE OR REPLACE VIEW pending_student_requests AS
  SELECT operator_id, COUNT(*) as count
  FROM lesson_requests
  WHERE status = 'pending_approval'
  GROUP BY operator_id;
