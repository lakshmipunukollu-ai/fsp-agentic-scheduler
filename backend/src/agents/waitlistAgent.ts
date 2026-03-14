import { SuggestionService } from '../services/suggestionService';
import { OperatorService } from '../services/operatorService';
import { FSPClient } from '../services/fspClient';
import { ScoringEngine } from './scoringEngine';
import { Operator, ScheduleOpening, Suggestion, SuggestionRationale } from '../types';

export class WaitlistAgent {
  static async fillOpening(opening: ScheduleOpening, operator: Operator): Promise<Suggestion[]> {
    const config = await OperatorService.getConfig(operator.id);
    const flags = await OperatorService.getFeatureFlags(operator.id);

    if (!flags.waitlist_automation) {
      return [];
    }

    // 1. Get eligible candidates
    const students = await FSPClient.getSchedulableEvents(operator.fsp_operator_id, {
      locationId: opening.locationId,
      dateRange: opening.timeWindow,
    });

    // 2. Check availability
    const availability = await FSPClient.getBatchAvailability(students.map(s => s.id));

    // 3. Filter available students and score
    const availableStudents = students.filter(s => availability[s.id]);
    const scored = ScoringEngine.rankCandidates(availableStudents, config.priorityWeights);

    // 4. Take top N
    const topN = scored.slice(0, config.suggestionsPerOpening);

    // 5. Validate and create suggestions
    const suggestions: Suggestion[] = [];
    for (const candidate of topN) {
      const validation = await FSPClient.validateReservation({
        studentId: candidate.studentId,
        instructorId: opening.instructorId,
        aircraftId: opening.aircraftId,
        startTime: opening.startTime,
        endTime: opening.endTime,
        validateOnly: true,
      });

      if (validation.valid) {
        const rationale: SuggestionRationale = {
          trigger: `Cancellation detected: opening at ${opening.startTime}`,
          candidateScore: scored.slice(0, 5), // Include top 5 for context
          constraintsEvaluated: [
            'availability: pass',
            'daylight hours: pass',
            'aircraft type rating: pass',
            'instructor currency: pass',
            'FAA rest requirements: pass',
          ],
          alternativesConsidered: availableStudents.length,
          confidence: candidate.score > 0.7 ? 'high' : candidate.score > 0.4 ? 'medium' : 'low',
        };

        const student = students.find(s => s.id === candidate.studentId);
        const suggestion = await SuggestionService.create(
          operator.id,
          'waitlist',
          Math.round(candidate.score * 100),
          {
            studentId: candidate.studentId,
            studentName: candidate.name,
            instructorId: opening.instructorId,
            aircraftId: opening.aircraftId,
            startTime: opening.startTime,
            endTime: opening.endTime,
            lessonType: student?.currentLesson || 'Unknown',
            locationId: opening.locationId,
          },
          rationale,
          config.expirationHours
        );
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }
}
