import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getPool, closePool } from './connection';
import { DEFAULT_OPERATOR_CONFIG, DEFAULT_FEATURE_FLAGS } from '../types';
import { Pool } from 'pg';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function hoursFromNow(n: number): string {
  const d = new Date();
  d.setHours(d.getHours() + n);
  return d.toISOString();
}

export async function seedDatabase(pool: Pool) {
  // Wipe existing data in correct foreign key order (ignore missing tables)
  const safeDel = (sql: string) => pool.query(sql).catch(() => {});
  await safeDel(`DELETE FROM notifications`);
  await safeDel(`DELETE FROM scheduled_lessons`);
  await safeDel(`DELETE FROM lesson_requests`);
  await safeDel(`DELETE FROM student_availability`);
  await safeDel(`DELETE FROM student_profiles`);
  await safeDel(`DELETE FROM audit_log`);
  await safeDel(`DELETE FROM cancellation_events`);
  await safeDel(`DELETE FROM suggestions`);
  await safeDel(`DELETE FROM users`);
  await safeDel(`DELETE FROM operators`);

  // Create operator
  const operatorId = uuidv4();
  await pool.query(
    `INSERT INTO operators (id, fsp_operator_id, name, config, feature_flags)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (fsp_operator_id) DO NOTHING`,
    [operatorId, 'FSP-001', 'SkyHigh Flight School', JSON.stringify(DEFAULT_OPERATOR_CONFIG), JSON.stringify(DEFAULT_FEATURE_FLAGS)]
  );
  const opResult = await pool.query(`SELECT id FROM operators WHERE fsp_operator_id = 'FSP-001'`);
  const opId = opResult.rows[0].id;

  // Create users
  const adminId = uuidv4();
  const schedulerId = uuidv4();
  const adminHash = await bcrypt.hash('admin123', 10);
  const schedulerHash = await bcrypt.hash('scheduler123', 10);

  await pool.query(
    `INSERT INTO users (id, operator_id, email, password_hash, name, role)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`,
    [adminId, opId, 'admin@skyhigh.com', adminHash, 'Admin User', 'admin']
  );
  await pool.query(
    `INSERT INTO users (id, operator_id, email, password_hash, name, role)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`,
    [schedulerId, opId, 'dispatcher@skyhigh.com', schedulerHash, 'Jane Dispatcher', 'scheduler']
  );

  const suggestions = [
    // --- APPROVED (past week) ---
    {
      type: 'waitlist', status: 'approved', priority: 95, createdAt: daysAgo(6), reviewedAt: daysAgo(6),
      payload: { studentId: 'STU-101', studentName: 'John Smith', instructorId: 'INS-201', instructorName: 'Capt. Sarah Johnson', aircraftId: 'AC-301', aircraftTail: 'N12345', startTime: hoursFromNow(-144), endTime: hoursFromNow(-142), lessonType: 'Private Pilot - Lesson 12', locationId: 'LOC-001' },
      rationale: { trigger: 'Cancellation detected: reservation #R-4567 by Mike Brown', candidateScore: [{ studentId: 'STU-101', name: 'John Smith', score: 0.92, signals: { daysSinceLastFlight: 14, daysUntilNextFlight: 21, totalFlightHours: 35, customWeights: {} } }], constraintsEvaluated: ['availability: pass', 'daylight hours: pass', 'aircraft type rating: pass', 'instructor currency: pass', 'FAA rest requirements: pass'], alternativesConsidered: 8, confidence: 'high' as const },
    },
    {
      type: 'reschedule', status: 'approved', priority: 80, createdAt: daysAgo(5), reviewedAt: daysAgo(5),
      payload: { studentId: 'STU-103', studentName: 'Alex Turner', instructorId: 'INS-202', instructorName: 'Capt. Mike Rogers', aircraftId: 'AC-302', aircraftTail: 'N67890', startTime: hoursFromNow(-120), endTime: hoursFromNow(-118), lessonType: 'Instrument Rating - Lesson 5', locationId: 'LOC-001' },
      rationale: { trigger: 'Weather cancellation: original slot 5 days ago', candidateScore: [{ studentId: 'STU-103', name: 'Alex Turner', score: 0.85, signals: { daysSinceLastFlight: 3, daysUntilNextFlight: 14, totalFlightHours: 68, customWeights: {} } }], constraintsEvaluated: ['availability: pass', 'aircraft IFR equipped: pass', 'instructor IFR current: pass'], alternativesConsidered: 5, confidence: 'medium' as const },
    },
    {
      type: 'next_lesson', status: 'approved', priority: 75, createdAt: daysAgo(4), reviewedAt: daysAgo(4),
      payload: { studentId: 'STU-104', studentName: 'David Wilson', instructorId: 'INS-203', instructorName: 'Capt. Lisa Park', aircraftId: 'AC-301', aircraftTail: 'N12345', startTime: hoursFromNow(-96), endTime: hoursFromNow(-94), lessonType: 'Private Pilot - Lesson 8', locationId: 'LOC-001' },
      rationale: { trigger: 'Lesson completion: Private Pilot - Lesson 7 completed', candidateScore: [{ studentId: 'STU-104', name: 'David Wilson', score: 0.88, signals: { daysSinceLastFlight: 1, daysUntilNextFlight: 0, totalFlightHours: 22, customWeights: {} } }], constraintsEvaluated: ['syllabus progression: pass', 'instructor availability: pass', 'aircraft availability: pass'], alternativesConsidered: 4, confidence: 'high' as const },
    },
    {
      type: 'waitlist', status: 'approved', priority: 90, createdAt: daysAgo(3), reviewedAt: daysAgo(3),
      payload: { studentId: 'STU-105', studentName: 'Maria Garcia', instructorId: 'INS-201', instructorName: 'Capt. Sarah Johnson', aircraftId: 'AC-303', aircraftTail: 'N11223', startTime: hoursFromNow(-72), endTime: hoursFromNow(-70), lessonType: 'Private Pilot - Lesson 15', locationId: 'LOC-001' },
      rationale: { trigger: 'Cancellation fill: reservation #R-4500', candidateScore: [{ studentId: 'STU-105', name: 'Maria Garcia', score: 0.95, signals: { daysSinceLastFlight: 21, daysUntilNextFlight: 30, totalFlightHours: 40, customWeights: {} } }], constraintsEvaluated: ['availability: pass', 'daylight: pass', 'aircraft: pass'], alternativesConsidered: 6, confidence: 'high' as const },
    },
    {
      type: 'discovery', status: 'approved', priority: 70, createdAt: daysAgo(2), reviewedAt: daysAgo(2),
      payload: { studentId: 'STU-NEW-001', studentName: 'Rachel Green', instructorId: 'INS-201', instructorName: 'Capt. Sarah Johnson', aircraftId: 'AC-302', aircraftTail: 'N67890', startTime: hoursFromNow(-48), endTime: hoursFromNow(-46), lessonType: 'Discovery Flight', locationId: 'LOC-001' },
      rationale: { trigger: 'New discovery flight request from website form', candidateScore: [{ studentId: 'STU-NEW-001', name: 'Rachel Green', score: 1.0, signals: { daysSinceLastFlight: 0, daysUntilNextFlight: 0, totalFlightHours: 0, customWeights: { leadSource: 0.5 } } }], constraintsEvaluated: ['instructor availability: pass', 'aircraft availability: pass', 'weather forecast: pass'], alternativesConsidered: 3, confidence: 'high' as const },
    },
    {
      type: 'next_lesson', status: 'approved', priority: 72, createdAt: daysAgo(1), reviewedAt: daysAgo(1),
      payload: { studentId: 'STU-106', studentName: 'James Park', instructorId: 'INS-203', instructorName: 'Capt. Lisa Park', aircraftId: 'AC-301', aircraftTail: 'N12345', startTime: hoursFromNow(-24), endTime: hoursFromNow(-22), lessonType: 'Commercial Pilot - Lesson 3', locationId: 'LOC-001' },
      rationale: { trigger: 'Lesson completion: Commercial Pilot - Lesson 2 completed yesterday', candidateScore: [{ studentId: 'STU-106', name: 'James Park', score: 0.91, signals: { daysSinceLastFlight: 1, daysUntilNextFlight: 0, totalFlightHours: 95, customWeights: {} } }], constraintsEvaluated: ['commercial syllabus check: pass', 'instructor availability: pass', 'aircraft availability: pass', 'student currency: pass'], alternativesConsidered: 2, confidence: 'high' as const },
    },

    // --- DECLINED ---
    {
      type: 'waitlist', status: 'declined', priority: 60, createdAt: daysAgo(5), reviewedAt: daysAgo(5),
      payload: { studentId: 'STU-107', studentName: 'Kevin Lee', instructorId: 'INS-202', instructorName: 'Capt. Mike Rogers', aircraftId: 'AC-302', aircraftTail: 'N67890', startTime: hoursFromNow(-115), endTime: hoursFromNow(-113), lessonType: 'Private Pilot - Lesson 4', locationId: 'LOC-001' },
      rationale: { trigger: 'Cancellation detected: reservation #R-4321', candidateScore: [{ studentId: 'STU-107', name: 'Kevin Lee', score: 0.62, signals: { daysSinceLastFlight: 2, daysUntilNextFlight: 3, totalFlightHours: 12, customWeights: {} } }, { studentId: 'STU-108', name: 'Marcus Thompson', score: 0.71, signals: { daysSinceLastFlight: 8, daysUntilNextFlight: 15, totalFlightHours: 28, customWeights: {} } }], constraintsEvaluated: ['availability: pass', 'daylight hours: pass', 'medical currency: WARN - expires in 30 days'], alternativesConsidered: 7, confidence: 'medium' as const },
    },
    {
      type: 'reschedule', status: 'declined', priority: 55, createdAt: daysAgo(3), reviewedAt: daysAgo(3),
      payload: { studentId: 'STU-109', studentName: 'Tom Brady', instructorId: 'INS-201', instructorName: 'Capt. Sarah Johnson', aircraftId: 'AC-303', aircraftTail: 'N11223', startTime: hoursFromNow(-68), endTime: hoursFromNow(-66), lessonType: 'Instrument Rating - Lesson 2', locationId: 'LOC-001' },
      rationale: { trigger: 'Weather cancellation 3 days ago', candidateScore: [{ studentId: 'STU-109', name: 'Tom Brady', score: 0.58, signals: { daysSinceLastFlight: 1, daysUntilNextFlight: 2, totalFlightHours: 55, customWeights: {} } }], constraintsEvaluated: ['availability: pass', 'IFR currency: FAIL - not current'], alternativesConsidered: 3, confidence: 'low' as const },
    },

    // --- EXPIRED ---
    {
      type: 'waitlist', status: 'expired', priority: 65, createdAt: daysAgo(4), reviewedAt: null,
      payload: { studentId: 'STU-110', studentName: 'Nina Patel', instructorId: 'INS-202', instructorName: 'Capt. Mike Rogers', aircraftId: 'AC-301', aircraftTail: 'N12345', startTime: hoursFromNow(-90), endTime: hoursFromNow(-88), lessonType: 'Private Pilot - Lesson 7', locationId: 'LOC-001' },
      rationale: { trigger: 'Cancellation detected: reservation #R-4400', candidateScore: [{ studentId: 'STU-110', name: 'Nina Patel', score: 0.78, signals: { daysSinceLastFlight: 5, daysUntilNextFlight: 12, totalFlightHours: 18, customWeights: {} } }], constraintsEvaluated: ['availability: pass', 'daylight: pass'], alternativesConsidered: 4, confidence: 'medium' as const },
    },

    // --- PENDING (current queue) ---
    {
      type: 'waitlist', status: 'pending', priority: 90, createdAt: hoursFromNow(-2), reviewedAt: null,
      payload: { studentId: 'STU-101', studentName: 'John Smith', instructorId: 'INS-201', instructorName: 'Capt. Sarah Johnson', aircraftId: 'AC-301', aircraftTail: 'N12345', startTime: hoursFromNow(24), endTime: hoursFromNow(26), lessonType: 'Private Pilot - Lesson 13', locationId: 'LOC-001' },
      rationale: { trigger: 'Cancellation detected: reservation #R-4600 by Mike Brown', candidateScore: [{ studentId: 'STU-101', name: 'John Smith', score: 0.92, signals: { daysSinceLastFlight: 8, daysUntilNextFlight: 14, totalFlightHours: 37, customWeights: {} } }, { studentId: 'STU-108', name: 'Marcus Thompson', score: 0.74, signals: { daysSinceLastFlight: 12, daysUntilNextFlight: 20, totalFlightHours: 28, customWeights: {} } }], constraintsEvaluated: ['availability: pass', 'daylight hours: pass', 'aircraft type rating: pass', 'instructor currency: pass', 'FAA rest requirements: pass'], alternativesConsidered: 8, confidence: 'high' as const },
    },
    {
      type: 'reschedule', status: 'pending', priority: 75, createdAt: hoursFromNow(-3), reviewedAt: null,
      payload: { studentId: 'STU-103', studentName: 'Alex Turner', instructorId: 'INS-202', instructorName: 'Capt. Mike Rogers', aircraftId: 'AC-302', aircraftTail: 'N67890', startTime: hoursFromNow(36), endTime: hoursFromNow(38), lessonType: 'Instrument Rating - Lesson 6', locationId: 'LOC-001' },
      rationale: { trigger: 'Weather cancellation: original slot 2 days ago', candidateScore: [{ studentId: 'STU-103', name: 'Alex Turner', score: 0.85, signals: { daysSinceLastFlight: 3, daysUntilNextFlight: 14, totalFlightHours: 70, customWeights: {} } }], constraintsEvaluated: ['availability: pass', 'daylight hours: pass', 'aircraft IFR equipped: pass', 'instructor IFR current: pass'], alternativesConsidered: 5, confidence: 'medium' as const },
    },
    {
      type: 'discovery', status: 'pending', priority: 60, createdAt: hoursFromNow(-1), reviewedAt: null,
      payload: { studentId: 'STU-NEW-002', studentName: 'Sophie Chen', instructorId: 'INS-201', instructorName: 'Capt. Sarah Johnson', aircraftId: 'AC-303', aircraftTail: 'N11223', startTime: hoursFromNow(48), endTime: hoursFromNow(49.5), lessonType: 'Discovery Flight', locationId: 'LOC-001' },
      rationale: { trigger: 'New discovery flight request via website', candidateScore: [{ studentId: 'STU-NEW-002', name: 'Sophie Chen', score: 1.0, signals: { daysSinceLastFlight: 0, daysUntilNextFlight: 0, totalFlightHours: 0, customWeights: { leadSource: 0.5 } } }], constraintsEvaluated: ['instructor availability: pass', 'aircraft availability: pass', 'weather forecast: pass'], alternativesConsidered: 2, confidence: 'high' as const },
    },
    {
      type: 'next_lesson', status: 'pending', priority: 50, createdAt: hoursFromNow(-4), reviewedAt: null,
      payload: { studentId: 'STU-104', studentName: 'David Wilson', instructorId: 'INS-203', instructorName: 'Capt. Lisa Park', aircraftId: 'AC-301', aircraftTail: 'N12345', startTime: hoursFromNow(72), endTime: hoursFromNow(74), lessonType: 'Private Pilot - Lesson 9', locationId: 'LOC-001' },
      rationale: { trigger: 'Lesson completion: Private Pilot - Lesson 8 completed today', candidateScore: [{ studentId: 'STU-104', name: 'David Wilson', score: 0.88, signals: { daysSinceLastFlight: 1, daysUntilNextFlight: 0, totalFlightHours: 24, customWeights: {} } }], constraintsEvaluated: ['syllabus progression: pass', 'instructor availability: pass', 'aircraft availability: pass', 'student currency: pass'], alternativesConsidered: 4, confidence: 'high' as const },
    },
    {
      type: 'waitlist', status: 'pending', priority: 85, createdAt: hoursFromNow(-1.5), reviewedAt: null,
      payload: { studentId: 'STU-111', studentName: 'Carlos Rivera', instructorId: 'INS-202', instructorName: 'Capt. Mike Rogers', aircraftId: 'AC-302', aircraftTail: 'N67890', startTime: hoursFromNow(30), endTime: hoursFromNow(32), lessonType: 'Commercial Pilot - Lesson 7', locationId: 'LOC-001' },
      rationale: { trigger: 'Cancellation detected: reservation #R-4610 by Emma White', candidateScore: [{ studentId: 'STU-111', name: 'Carlos Rivera', score: 0.89, signals: { daysSinceLastFlight: 9, daysUntilNextFlight: 18, totalFlightHours: 88, customWeights: {} } }, { studentId: 'STU-112', name: 'Aisha Johnson', score: 0.76, signals: { daysSinceLastFlight: 6, daysUntilNextFlight: 10, totalFlightHours: 62, customWeights: {} } }], constraintsEvaluated: ['availability: pass', 'commercial rating check: pass', 'aircraft type: pass', 'instructor currency: pass'], alternativesConsidered: 10, confidence: 'high' as const },
    },
  ];

  for (const s of suggestions) {
    const suggestionId = uuidv4();
    if (s.status === 'expired') {
      await pool.query(
        `INSERT INTO suggestions (id, operator_id, type, status, priority, payload, rationale, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [suggestionId, opId, s.type, s.status, s.priority, JSON.stringify(s.payload), JSON.stringify(s.rationale), s.createdAt, s.createdAt]
      );
    } else if (s.reviewedAt) {
      await pool.query(
        `INSERT INTO suggestions (id, operator_id, type, status, priority, payload, rationale, created_at, reviewed_at, reviewed_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '24 hours')`,
        [suggestionId, opId, s.type, s.status, s.priority, JSON.stringify(s.payload), JSON.stringify(s.rationale), s.createdAt, s.reviewedAt, schedulerId]
      );
    } else {
      await pool.query(
        `INSERT INTO suggestions (id, operator_id, type, status, priority, payload, rationale, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '24 hours')`,
        [suggestionId, opId, s.type, s.status, s.priority, JSON.stringify(s.payload), JSON.stringify(s.rationale), s.createdAt]
      );
    }

    await pool.query(
      `INSERT INTO audit_log (operator_id, suggestion_id, event_type, actor, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [opId, suggestionId, 'suggestion_created', 'agent', JSON.stringify({ type: s.type, confidence: s.rationale.confidence }), s.createdAt]
    );

    if (s.status === 'approved' && s.reviewedAt) {
      await pool.query(
        `INSERT INTO audit_log (operator_id, suggestion_id, event_type, actor, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [opId, suggestionId, 'suggestion_approved', `scheduler:${schedulerId}`, JSON.stringify({ notes: 'Approved' }), s.reviewedAt]
      );
    }
    if (s.status === 'declined' && s.reviewedAt) {
      await pool.query(
        `INSERT INTO audit_log (operator_id, suggestion_id, event_type, actor, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [opId, suggestionId, 'suggestion_declined', `scheduler:${schedulerId}`, JSON.stringify({ reason: 'Constraint conflict' }), s.reviewedAt]
      );
    }
  }

  // --- STUDENT USERS & PROFILES ---
  const students = [
    { name: 'Emma Wilson',      email: 'emma@skyhigh.com',      password: 'student123', license: 'PPL', hoursLogged: 37,  hoursRequired: 70,  daysAgoStart: 45,  flightsLast30: 12, lastFlightDaysAgo: 2  },
    { name: 'Aisha Patel',      email: 'aisha@skyhigh.com',     password: 'student123', license: 'PPL', hoursLogged: 52,  hoursRequired: 70,  daysAgoStart: 60,  flightsLast30: 10, lastFlightDaysAgo: 1  },
    { name: 'James Kowalski',   email: 'james@skyhigh.com',     password: 'student123', license: 'CPL', hoursLogged: 185, hoursRequired: 250, daysAgoStart: 180, flightsLast30: 9,  lastFlightDaysAgo: 3  },
    { name: 'Carlos Rivera',    email: 'carlos@skyhigh.com',    password: 'student123', license: 'CPL', hoursLogged: 112, hoursRequired: 250, daysAgoStart: 120, flightsLast30: 5,  lastFlightDaysAgo: 9  },
    { name: 'Taylor Brooks',    email: 'taylor@skyhigh.com',    password: 'student123', license: 'IR',  hoursLogged: 45,  hoursRequired: 115, daysAgoStart: 90,  flightsLast30: 4,  lastFlightDaysAgo: 6  },
    { name: 'Priya Menon',      email: 'priya@skyhigh.com',     password: 'student123', license: 'PPL', hoursLogged: 22,  hoursRequired: 70,  daysAgoStart: 50,  flightsLast30: 3,  lastFlightDaysAgo: 8  },
    { name: 'Sophie Chen',      email: 'sophie@skyhigh.com',    password: 'student123', license: 'IR',  hoursLogged: 28,  hoursRequired: 115, daysAgoStart: 60,  flightsLast30: 2,  lastFlightDaysAgo: 18 },
    { name: 'Derek Williams',   email: 'derek@skyhigh.com',     password: 'student123', license: 'PPL', hoursLogged: 15,  hoursRequired: 70,  daysAgoStart: 55,  flightsLast30: 1,  lastFlightDaysAgo: 14 },
    { name: 'Lena Fischer',     email: 'lena@skyhigh.com',      password: 'student123', license: 'CPL', hoursLogged: 78,  hoursRequired: 250, daysAgoStart: 95,  flightsLast30: 2,  lastFlightDaysAgo: 12 },
    { name: 'Marcus Johnson',   email: 'marcus@skyhigh.com',    password: 'student123', license: 'PPL', hoursLogged: 8,   hoursRequired: 70,  daysAgoStart: 30,  flightsLast30: 0,  lastFlightDaysAgo: 30 },
    { name: 'Ryan Okafor',      email: 'ryan@skyhigh.com',      password: 'student123', license: 'PPL', hoursLogged: 5,   hoursRequired: 70,  daysAgoStart: 20,  flightsLast30: 0,  lastFlightDaysAgo: 22 },
  ];

  const instructors = [
    'Capt. Sarah Johnson', 'Capt. Mike Rogers', 'Capt. Lisa Park', 'Capt. Sarah Johnson',
    'Capt. Mike Rogers', 'Capt. Lisa Park', 'Capt. Sarah Johnson', 'Capt. Mike Rogers',
    'Capt. Lisa Park', 'Capt. Sarah Johnson', 'Capt. Mike Rogers',
  ];
  const aircraft = [
    'N12345', 'N67890', 'N11223', 'N12345',
    'N67890', 'N11223', 'N12345', 'N67890',
    'N11223', 'N12345', 'N67890',
  ];

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const studentId = uuidv4();
    const hash = await bcrypt.hash(s.password, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - s.daysAgoStart);
    const lastFlightDate = new Date();
    lastFlightDate.setDate(lastFlightDate.getDate() - s.lastFlightDaysAgo);

    await pool.query(
      `INSERT INTO users (id, operator_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5, 'student') ON CONFLICT (email) DO NOTHING`,
      [studentId, opId, s.email, hash, s.name]
    );

    const userResult = await pool.query(`SELECT id FROM users WHERE email = $1`, [s.email]);
    const uid = userResult.rows[0].id;

    await pool.query(
      `INSERT INTO student_profiles
         (user_id, operator_id, license_type, hours_logged, hours_scheduled, hours_required,
          lessons_per_week_target, instructor_name, aircraft_tail, program_start_date,
          flights_last_30_days, last_flight_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id) DO UPDATE SET
         hours_logged = $4, flights_last_30_days = $11, last_flight_date = $12`,
      [uid, opId, s.license, s.hoursLogged, s.hoursLogged * 0.1, s.hoursRequired,
       2, instructors[i], aircraft[i], startDate.toISOString().split('T')[0],
       s.flightsLast30, lastFlightDate.toISOString().split('T')[0]]
    ).catch(() => {});

    const olderLessons = Math.max(0, Math.floor(s.hoursLogged / 2) - s.flightsLast30);
    const allLessons = [
      ...Array.from({ length: s.flightsLast30 }, (_, j) => {
        const windowSize = Math.max(0, 29 - s.lastFlightDaysAgo);
        const spread = s.flightsLast30 > 1
          ? Math.round((j / (s.flightsLast30 - 1)) * windowSize)
          : 0;
        return { daysBack: s.lastFlightDaysAgo + spread, label: `Lesson ${j + 1}` };
      }),
      ...Array.from({ length: olderLessons }, (_, j) => ({
        daysBack: 31 + j * 7,
        label: `Lesson ${s.flightsLast30 + j + 1}`,
      })),
    ];
    for (let j = 0; j < allLessons.length; j++) {
      const { daysBack, label } = allLessons[j];
      const lessonDate = new Date();
      lessonDate.setDate(lessonDate.getDate() - daysBack);
      lessonDate.setHours(9 + (j % 6), 0, 0, 0);
      const endDate = new Date(lessonDate);
      endDate.setHours(endDate.getHours() + 2);
      await pool.query(
        `INSERT INTO scheduled_lessons (user_id, operator_id, lesson_type, instructor_name, aircraft_tail, start_time, end_time, status, duration_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', 2)`,
        [uid, opId, `${s.license} - ${label}`, instructors[i], aircraft[i], lessonDate.toISOString(), endDate.toISOString()]
      );
    }
  }

  // Add future confirmed lessons so utilization shows non-zero
  const studentUsers = await pool.query(
    `SELECT sp.user_id, sp.instructor_name, sp.aircraft_tail, sp.license_type FROM student_profiles sp WHERE sp.operator_id = $1`,
    [opId]
  );

  for (const s of studentUsers.rows) {
    for (let i = 0; i < 3; i++) {
      const lessonDate = new Date();
      lessonDate.setDate(lessonDate.getDate() + (i + 1) * 2);
      lessonDate.setHours(9 + i * 2, 0, 0, 0);
      const endDate = new Date(lessonDate);
      endDate.setHours(endDate.getHours() + 2);
      await pool.query(
        `INSERT INTO scheduled_lessons (user_id, operator_id, lesson_type, instructor_name, aircraft_tail, start_time, end_time, status, duration_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', 2)`,
        [s.user_id, opId, `${s.license_type} - Upcoming Lesson ${i + 1}`, s.instructor_name, s.aircraft_tail, lessonDate.toISOString(), endDate.toISOString()]
      );
    }
  }

  // Add some notifications
  await pool.query(`DELETE FROM notifications WHERE operator_id = $1`, [opId]);
  const studentUsersForNotif = await pool.query(`SELECT id, name FROM users WHERE operator_id = $1 AND role = 'student' LIMIT 2`, [opId]);
  for (const u of studentUsersForNotif.rows) {
    await pool.query(
      `INSERT INTO notifications (operator_id, user_id, type, title, body, payload)
       VALUES ($1, $2, 'lesson_confirmed', 'Lesson Confirmed!', $3, $4)`,
      [opId, u.id, `Your upcoming lesson has been confirmed by your instructor.`, JSON.stringify({ studentName: u.name })]
    );
  }

  console.log('[seed] Demo data inserted: 15 suggestions, 11 students, lessons, and notifications.');
}

/** Seed is needed when the demo data (suggestions) hasn't been loaded yet */
export async function needsSeed(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS cnt FROM suggestions');
    return result.rows[0].cnt === 0;
  } catch {
    return true;
  }
}

// CLI entrypoint: `npm run seed` still works
if (require.main === module) {
  const pool = getPool();
  seedDatabase(pool)
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
