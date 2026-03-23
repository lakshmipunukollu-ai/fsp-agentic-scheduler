import { query } from '../db/connection';
import { WaitlistAgent } from './waitlistAgent';
import { RescheduleAgent } from './rescheduleAgent';
import { NextLessonAgent } from './nextLessonAgent';
import { DiscoveryFlightAgent } from './discoveryFlightAgent';
import { OperatorService } from '../services/operatorService';
import { FSPClient } from '../services/fspClient';
import { SuggestionService } from '../services/suggestionService';
import { Operator, ScheduleEvent } from '../types';

const AT_RISK_IDLE_DAYS = 7;
const AT_RISK_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day

export class ScheduleWatcher {
  private intervalId: NodeJS.Timeout | null = null;
  private atRiskScanId: NodeJS.Timeout | null = null;

  start(intervalMs: number = 300000): void {
    console.log(`ScheduleWatcher started. Polling every ${intervalMs / 1000}s`);
    this.intervalId = setInterval(() => this.poll(), intervalMs);
    // Also run immediately
    this.poll();

    // Daily at-risk student scan
    this.atRiskScanId = setInterval(() => this.scanAtRiskStudents(), AT_RISK_SCAN_INTERVAL_MS);
    // Run first scan after 5 minutes so DB is warmed
    setTimeout(() => this.scanAtRiskStudents(), 5 * 60 * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.atRiskScanId) {
      clearInterval(this.atRiskScanId);
      this.atRiskScanId = null;
    }
    console.log('ScheduleWatcher stopped.');
  }

  async scanAtRiskStudents(): Promise<void> {
    try {
      const operatorsResult = await query('SELECT * FROM operators');
      for (const operator of operatorsResult.rows as Operator[]) {
        const config = await OperatorService.getConfig(operator.id);
        const avgPrice = config.avgLessonPriceUsd || 185;

        // Find students with no recent flights using live scheduled_lessons data
        const result = await query(
          `SELECT
             sp.user_id, u.name, sp.license_type, sp.hours_logged, sp.hours_required,
             COUNT(sl.id) FILTER (WHERE sl.start_time >= NOW() - INTERVAL '30 days' AND sl.status = 'completed') AS flights_last_30_days,
             MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') AS last_flight_date
           FROM student_profiles sp
           JOIN users u ON u.id = sp.user_id
           LEFT JOIN scheduled_lessons sl ON sl.user_id = sp.user_id AND sl.operator_id = sp.operator_id
           WHERE sp.operator_id = $1
           GROUP BY sp.user_id, u.name, sp.license_type, sp.hours_logged, sp.hours_required
           HAVING
             MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') IS NULL
             OR MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') <= NOW() - make_interval(days => $2)`,
          [operator.id, AT_RISK_IDLE_DAYS]
        );

        for (const row of result.rows) {
          const daysSinceLast = row.last_flight_date
            ? Math.floor((Date.now() - new Date(row.last_flight_date).getTime()) / 86400000)
            : 999;

          // Skip if we already have a pending nudge for this student in the last 48h
          const dupCheck = await query(
            `SELECT id FROM suggestions
             WHERE operator_id = $1 AND type = 'at_risk_nudge' AND status = 'pending'
               AND payload->>'studentId' = $2
               AND created_at >= NOW() - INTERVAL '48 hours'`,
            [operator.id, row.user_id]
          );
          if (dupCheck.rows.length > 0) continue;

          await SuggestionService.create(
            operator.id,
            'at_risk_nudge',
            75,
            {
              studentId: row.user_id,
              studentName: row.name,
              // No startTime/endTime — this is a scheduling outreach, not a booking
              actionType: 'scheduling_outreach',
              lessonType: `${row.license_type || 'Flight'} — Outreach: Student hasn't flown in ${daysSinceLast} days`,
            },
            {
              trigger: `Automated daily scan: ${row.name} has not flown in ${daysSinceLast} days — graduation timeline at risk`,
              candidateScore: [{
                studentId: row.user_id,
                name: row.name,
                score: 0.80,
                signals: { daysSinceLastFlight: daysSinceLast, daysUntilNextFlight: 999, totalFlightHours: Number(row.hours_logged) || 0, customWeights: { frequencyRisk: 0.9 } },
              }],
              constraintsEvaluated: [`frequency threshold: FAIL — idle ${daysSinceLast} days`, 'graduation timeline: at risk'],
              alternativesConsidered: 0,
              confidence: daysSinceLast > 14 ? 'high' : 'medium',
              summary: `${row.name} has not flown in ${daysSinceLast} days. The daily at-risk scan flagged this student — a scheduling nudge is recommended to get them back on track before their graduation timeline slips further. Estimated extra cost at current pace: $${Math.round((daysSinceLast / 7) * avgPrice)}.`,
            },
            72
          );

          console.log(`[AtRiskScan] Created nudge suggestion for ${row.name} (${daysSinceLast}d idle)`);
        }
      }
    } catch (error) {
      console.error('[AtRiskScan] Error:', error);
    }
  }

  async poll(): Promise<void> {
    try {
      // Get all operators
      const operatorsResult = await query('SELECT * FROM operators');
      for (const operator of operatorsResult.rows as Operator[]) {
        await this.processOperator(operator);
      }
    } catch (error) {
      console.error('ScheduleWatcher poll error:', error);
    }
  }

  private async processOperator(operator: Operator): Promise<void> {
    // Get unprocessed events for this operator
    const eventsResult = await query(
      `SELECT * FROM schedule_events WHERE operator_id = $1 AND processed = FALSE ORDER BY created_at ASC`,
      [operator.id]
    );

    for (const event of eventsResult.rows as ScheduleEvent[]) {
      try {
        await this.processEvent(event, operator);
        await query(
          'UPDATE schedule_events SET processed = TRUE WHERE id = $1',
          [event.id]
        );
      } catch (error) {
        console.error(`Error processing event ${event.id}:`, error);
      }
    }
  }

  private async processEvent(event: ScheduleEvent, operator: Operator): Promise<void> {
    const data = event.event_data as Record<string, string>;

    switch (event.event_type) {
      case 'cancellation':
        // Try to fill the opening with a waitlisted student
        await WaitlistAgent.fillOpening(
          {
            locationId: data.locationId || 'LOC-001',
            instructorId: data.instructorId || 'INS-201',
            aircraftId: data.aircraftId || 'AC-301',
            startTime: data.startTime || new Date().toISOString(),
            endTime: data.endTime || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            lessonType: data.lessonType || 'Unknown',
            timeWindow: {
              start: data.startTime || new Date().toISOString(),
              end: data.endTime || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
          },
          operator
        );

        // Also try to reschedule the original student
        if (data.studentId) {
          const student = await FSPClient.getStudent(operator.fsp_operator_id, data.studentId);
          if (student) {
            await RescheduleAgent.handleCancellation(
              student,
              {
                startTime: data.startTime || '',
                endTime: data.endTime || '',
                instructorId: data.instructorId || '',
                aircraftId: data.aircraftId || '',
                locationId: data.locationId || 'LOC-001',
              },
              operator
            );
          }
        }
        break;

      case 'completion':
        if (data.studentId && data.completedLesson) {
          const student = await FSPClient.getStudent(operator.fsp_operator_id, data.studentId);
          if (student) {
            await NextLessonAgent.scheduleNextLesson(student, data.completedLesson as string, operator);
          }
        }
        break;

      case 'waitlist_add':
        // Similar to cancellation handling
        break;

      default:
        console.log(`Unknown event type: ${event.event_type}`);
    }
  }
}
