import { query } from '../db/connection';
import { WaitlistAgent } from './waitlistAgent';
import { RescheduleAgent } from './rescheduleAgent';
import { NextLessonAgent } from './nextLessonAgent';
import { DiscoveryFlightAgent } from './discoveryFlightAgent';
import { OperatorService } from '../services/operatorService';
import { FSPClient } from '../services/fspClient';
import { Operator, ScheduleEvent } from '../types';

export class ScheduleWatcher {
  private intervalId: NodeJS.Timeout | null = null;

  start(intervalMs: number = 300000): void {
    console.log(`ScheduleWatcher started. Polling every ${intervalMs / 1000}s`);
    this.intervalId = setInterval(() => this.poll(), intervalMs);
    // Also run immediately
    this.poll();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('ScheduleWatcher stopped.');
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
