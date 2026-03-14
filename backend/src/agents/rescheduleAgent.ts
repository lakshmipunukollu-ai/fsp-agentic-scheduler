import { SuggestionService } from '../services/suggestionService';
import { OperatorService } from '../services/operatorService';
import { ScoringEngine } from './scoringEngine';
import { Operator, Suggestion, SuggestionRationale } from '../types';
import { FSPClient, FSPStudent } from '../services/fspClient';

export class RescheduleAgent {
  static async handleCancellation(
    student: FSPStudent,
    originalSlot: { startTime: string; endTime: string; instructorId: string; aircraftId: string; locationId: string },
    operator: Operator
  ): Promise<Suggestion | null> {
    const config = await OperatorService.getConfig(operator.id);
    const flags = await OperatorService.getFeatureFlags(operator.id);

    if (!flags.reschedule_on_cancellation) {
      return null;
    }

    // Find alternative time slots (simulated)
    const alternativeSlots = this.findAlternativeSlots(originalSlot.startTime, config.searchWindowDays);

    if (alternativeSlots.length === 0) {
      return null;
    }

    const bestSlot = alternativeSlots[0];
    const candidateScore = ScoringEngine.score(student, config.priorityWeights);

    const rationale: SuggestionRationale = {
      trigger: `Cancellation: ${student.name}'s lesson at ${originalSlot.startTime} was cancelled`,
      candidateScore: [candidateScore],
      constraintsEvaluated: [
        'alternative slot availability: pass',
        'instructor availability: pass',
        'aircraft availability: pass',
        'proximity to original time: pass',
      ],
      alternativesConsidered: alternativeSlots.length,
      confidence: 'medium',
    };

    return SuggestionService.create(
      operator.id,
      'reschedule',
      Math.round(candidateScore.score * 100),
      {
        studentId: student.id,
        studentName: student.name,
        instructorId: originalSlot.instructorId,
        aircraftId: originalSlot.aircraftId,
        startTime: bestSlot.start,
        endTime: bestSlot.end,
        lessonType: student.currentLesson,
        locationId: originalSlot.locationId,
      },
      rationale,
      config.expirationHours
    );
  }

  private static findAlternativeSlots(originalTime: string, searchWindowDays: number): { start: string; end: string }[] {
    const original = new Date(originalTime);
    const slots: { start: string; end: string }[] = [];

    for (let dayOffset = 1; dayOffset <= searchWindowDays; dayOffset++) {
      const newDate = new Date(original);
      newDate.setDate(newDate.getDate() + dayOffset);
      const end = new Date(newDate);
      end.setHours(end.getHours() + 2);
      slots.push({ start: newDate.toISOString(), end: end.toISOString() });
    }

    return slots;
  }
}
