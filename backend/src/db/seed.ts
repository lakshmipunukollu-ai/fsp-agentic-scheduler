import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getPool, closePool } from './connection';
import { DEFAULT_OPERATOR_CONFIG, DEFAULT_FEATURE_FLAGS } from '../types';

async function seed() {
  const pool = getPool();

  // Create operator
  const operatorId = uuidv4();
  await pool.query(
    `INSERT INTO operators (id, fsp_operator_id, name, config, feature_flags)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (fsp_operator_id) DO NOTHING`,
    [operatorId, 'FSP-001', 'SkyHigh Flight School', JSON.stringify(DEFAULT_OPERATOR_CONFIG), JSON.stringify(DEFAULT_FEATURE_FLAGS)]
  );

  // Get the operator id (in case it already existed)
  const opResult = await pool.query(`SELECT id FROM operators WHERE fsp_operator_id = 'FSP-001'`);
  const opId = opResult.rows[0].id;

  // Create admin user
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  await pool.query(
    `INSERT INTO users (id, operator_id, email, password_hash, name, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING`,
    [uuidv4(), opId, 'admin@skyhigh.com', adminPasswordHash, 'Admin User', 'admin']
  );

  // Create scheduler user
  const schedulerPasswordHash = await bcrypt.hash('scheduler123', 10);
  const schedulerUserId = uuidv4();
  await pool.query(
    `INSERT INTO users (id, operator_id, email, password_hash, name, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING`,
    [schedulerUserId, opId, 'dispatcher@skyhigh.com', schedulerPasswordHash, 'Jane Dispatcher', 'scheduler']
  );

  // Create sample suggestions
  const suggestions = [
    {
      type: 'waitlist',
      priority: 90,
      payload: {
        studentId: 'STU-101',
        studentName: 'John Smith',
        instructorId: 'INS-201',
        instructorName: 'Capt. Sarah Johnson',
        aircraftId: 'AC-301',
        aircraftTail: 'N12345',
        startTime: '2026-03-15T09:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        lessonType: 'Private Pilot - Lesson 12',
        locationId: 'LOC-001',
      },
      rationale: {
        trigger: 'Cancellation detected: reservation #R-4567 by Mike Brown',
        candidateScore: [
          {
            studentId: 'STU-101',
            name: 'John Smith',
            score: 0.92,
            signals: {
              daysSinceLastFlight: 14,
              daysUntilNextFlight: 21,
              totalFlightHours: 35,
              customWeights: {},
            },
          },
          {
            studentId: 'STU-102',
            name: 'Emily Davis',
            score: 0.78,
            signals: {
              daysSinceLastFlight: 7,
              daysUntilNextFlight: 10,
              totalFlightHours: 52,
              customWeights: {},
            },
          },
        ],
        constraintsEvaluated: [
          'availability: pass',
          'daylight hours: pass',
          'aircraft type rating: pass',
          'instructor currency: pass',
          'FAA rest requirements: pass',
        ],
        alternativesConsidered: 8,
        confidence: 'high' as const,
      },
    },
    {
      type: 'reschedule',
      priority: 75,
      payload: {
        studentId: 'STU-103',
        studentName: 'Alex Turner',
        instructorId: 'INS-202',
        instructorName: 'Capt. Mike Rogers',
        aircraftId: 'AC-302',
        aircraftTail: 'N67890',
        startTime: '2026-03-16T14:00:00Z',
        endTime: '2026-03-16T16:00:00Z',
        lessonType: 'Instrument Rating - Lesson 5',
        locationId: 'LOC-001',
      },
      rationale: {
        trigger: 'Weather cancellation: original slot 2026-03-14T10:00:00Z',
        candidateScore: [
          {
            studentId: 'STU-103',
            name: 'Alex Turner',
            score: 0.85,
            signals: {
              daysSinceLastFlight: 3,
              daysUntilNextFlight: 14,
              totalFlightHours: 68,
              customWeights: {},
            },
          },
        ],
        constraintsEvaluated: [
          'availability: pass',
          'daylight hours: pass',
          'aircraft IFR equipped: pass',
          'instructor IFR current: pass',
        ],
        alternativesConsidered: 5,
        confidence: 'medium' as const,
      },
    },
    {
      type: 'discovery',
      priority: 60,
      payload: {
        studentId: 'STU-NEW-001',
        studentName: 'Rachel Green',
        instructorId: 'INS-201',
        instructorName: 'Capt. Sarah Johnson',
        aircraftId: 'AC-303',
        aircraftTail: 'N11223',
        startTime: '2026-03-17T10:00:00Z',
        endTime: '2026-03-17T11:30:00Z',
        lessonType: 'Discovery Flight',
        locationId: 'LOC-001',
      },
      rationale: {
        trigger: 'New discovery flight request from website form',
        candidateScore: [
          {
            studentId: 'STU-NEW-001',
            name: 'Rachel Green',
            score: 1.0,
            signals: {
              daysSinceLastFlight: 0,
              daysUntilNextFlight: 0,
              totalFlightHours: 0,
              customWeights: { leadSource: 0.5 },
            },
          },
        ],
        constraintsEvaluated: [
          'instructor availability: pass',
          'aircraft availability: pass',
          'weather forecast: pass',
        ],
        alternativesConsidered: 3,
        confidence: 'high' as const,
      },
    },
    {
      type: 'next_lesson',
      priority: 50,
      payload: {
        studentId: 'STU-104',
        studentName: 'David Wilson',
        instructorId: 'INS-203',
        instructorName: 'Capt. Lisa Park',
        aircraftId: 'AC-301',
        aircraftTail: 'N12345',
        startTime: '2026-03-18T08:00:00Z',
        endTime: '2026-03-18T10:00:00Z',
        lessonType: 'Private Pilot - Lesson 8',
        locationId: 'LOC-001',
      },
      rationale: {
        trigger: 'Lesson completion: Private Pilot - Lesson 7 completed on 2026-03-13',
        candidateScore: [
          {
            studentId: 'STU-104',
            name: 'David Wilson',
            score: 0.88,
            signals: {
              daysSinceLastFlight: 1,
              daysUntilNextFlight: 0,
              totalFlightHours: 22,
              customWeights: {},
            },
          },
        ],
        constraintsEvaluated: [
          'syllabus progression: pass',
          'instructor availability: pass',
          'aircraft availability: pass',
          'student currency: pass',
        ],
        alternativesConsidered: 4,
        confidence: 'high' as const,
      },
    },
  ];

  for (const s of suggestions) {
    const suggestionId = uuidv4();
    await pool.query(
      `INSERT INTO suggestions (id, operator_id, type, status, priority, payload, rationale, expires_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, NOW() + INTERVAL '24 hours')`,
      [suggestionId, opId, s.type, s.priority, JSON.stringify(s.payload), JSON.stringify(s.rationale)]
    );

    // Audit log entry
    await pool.query(
      `INSERT INTO audit_log (operator_id, suggestion_id, event_type, actor, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [opId, suggestionId, 'suggestion_created', 'agent', JSON.stringify({ type: s.type, confidence: s.rationale.confidence })]
    );
  }

  // Add an approved suggestion for dashboard stats
  const approvedId = uuidv4();
  await pool.query(
    `INSERT INTO suggestions (id, operator_id, type, status, priority, payload, rationale, reviewed_at)
     VALUES ($1, $2, 'waitlist', 'approved', 80, $3, $4, NOW())`,
    [
      approvedId,
      opId,
      JSON.stringify({
        studentId: 'STU-105',
        studentName: 'Maria Garcia',
        instructorId: 'INS-201',
        instructorName: 'Capt. Sarah Johnson',
        aircraftId: 'AC-301',
        aircraftTail: 'N12345',
        startTime: '2026-03-14T09:00:00Z',
        endTime: '2026-03-14T11:00:00Z',
        lessonType: 'Private Pilot - Lesson 15',
      }),
      JSON.stringify({
        trigger: 'Cancellation fill: reservation #R-4500',
        candidateScore: [{ studentId: 'STU-105', name: 'Maria Garcia', score: 0.95, signals: { daysSinceLastFlight: 21, daysUntilNextFlight: 30, totalFlightHours: 40, customWeights: {} } }],
        constraintsEvaluated: ['availability: pass', 'daylight: pass', 'aircraft: pass'],
        alternativesConsidered: 6,
        confidence: 'high',
      }),
    ]
  );

  await pool.query(
    `INSERT INTO audit_log (operator_id, suggestion_id, event_type, actor, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [opId, approvedId, 'suggestion_approved', 'scheduler:' + schedulerUserId, JSON.stringify({ notes: 'Looks good' })]
  );

  await closePool();
  console.log('Seed data inserted successfully.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
