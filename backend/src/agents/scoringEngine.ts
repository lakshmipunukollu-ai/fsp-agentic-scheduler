import { OperatorConfig, CandidateScore } from '../types';
import { FSPStudent } from '../services/fspClient';

export class ScoringEngine {
  static score(student: FSPStudent, weights: OperatorConfig['priorityWeights'], waitlistPosition: number = 0): CandidateScore {
    const now = new Date();
    const lastFlight = new Date(student.lastFlightDate);
    const daysSinceLastFlight = Math.max(0, Math.floor((now.getTime() - lastFlight.getTime()) / (1000 * 60 * 60 * 24)));

    let daysUntilNextFlight = 999;
    if (student.nextScheduledFlight) {
      const nextFlight = new Date(student.nextScheduledFlight);
      daysUntilNextFlight = Math.max(0, Math.floor((nextFlight.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    // Normalize signals to 0-1 range
    const normalizedDaysSince = Math.min(daysSinceLastFlight / 30, 1); // More days = higher urgency
    const normalizedDaysUntil = daysUntilNextFlight === 999 ? 1 : Math.min(daysUntilNextFlight / 30, 1); // More days until next = more flexible
    const normalizedHours = 1 - Math.min(student.totalFlightHours / 100, 1); // Fewer hours = needs more training
    const normalizedWaitlist = 1 - Math.min(waitlistPosition / 10, 1); // Earlier position = higher priority

    const score =
      weights.daysSinceLastFlight * normalizedDaysSince +
      weights.daysUntilNextFlight * normalizedDaysUntil +
      weights.totalFlightHours * normalizedHours +
      weights.waitlistPosition * normalizedWaitlist;

    return {
      studentId: student.id,
      name: student.name,
      score: Math.round(score * 100) / 100,
      signals: {
        daysSinceLastFlight,
        daysUntilNextFlight,
        totalFlightHours: student.totalFlightHours,
        customWeights: {},
      },
    };
  }

  static rankCandidates(students: FSPStudent[], weights: OperatorConfig['priorityWeights']): CandidateScore[] {
    return students
      .map((student, index) => this.score(student, weights, index))
      .sort((a, b) => b.score - a.score);
  }
}
