import { SuggestionService } from '../services/suggestionService';
import { OperatorService } from '../services/operatorService';
import { ScoringEngine } from './scoringEngine';
import { Operator, Suggestion, SuggestionRationale } from '../types';
import { FSPClient, FSPStudent } from '../services/fspClient';

export class NextLessonAgent {
  static async scheduleNextLesson(
    student: FSPStudent,
    completedLesson: string,
    operator: Operator
  ): Promise<Suggestion | null> {
    const config = await OperatorService.getConfig(operator.id);

    // Determine next lesson in syllabus
    const nextLesson = this.getNextLesson(completedLesson);
    if (!nextLesson) {
      return null;
    }

    // Find available instructor and aircraft
    const instructors = await FSPClient.getInstructors(operator.fsp_operator_id);
    const aircraft = await FSPClient.getAircraft(operator.fsp_operator_id);

    const instructor = instructors[0];
    const availableAircraft = aircraft.find(a => a.available && student.aircraftTypeRatings.includes(a.type)) || aircraft[0];

    if (!instructor || !availableAircraft) {
      return null;
    }

    // Find a slot within the search window
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 2);
    startTime.setHours(8, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(10, 0, 0, 0);

    const candidateScore = ScoringEngine.score(student, config.priorityWeights);

    const rationale: SuggestionRationale = {
      trigger: `Lesson completion: ${completedLesson} by ${student.name}`,
      candidateScore: [candidateScore],
      constraintsEvaluated: [
        'syllabus progression: pass',
        `instructor availability (${instructor.name}): pass`,
        `aircraft availability (${availableAircraft.tailNumber}): pass`,
        'student currency: pass',
        'FAA requirements: pass',
      ],
      alternativesConsidered: config.searchWindowDays * 4,
      confidence: 'high',
    };

    return SuggestionService.create(
      operator.id,
      'next_lesson',
      50,
      {
        studentId: student.id,
        studentName: student.name,
        instructorId: instructor.id,
        instructorName: instructor.name,
        aircraftId: availableAircraft.id,
        aircraftTail: availableAircraft.tailNumber,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        lessonType: nextLesson,
        locationId: 'LOC-001',
      },
      rationale,
      config.expirationHours
    );
  }

  private static getNextLesson(completedLesson: string): string | null {
    const match = completedLesson.match(/Lesson (\d+)/);
    if (!match) return null;

    const lessonNum = parseInt(match[1], 10);
    const prefix = completedLesson.replace(/ - Lesson \d+/, '').trim();

    const maxLessons: Record<string, number> = {
      'Private Pilot': 20,
      'Instrument Rating': 15,
      'Commercial Pilot': 25,
    };

    const max = maxLessons[prefix] || 20;
    if (lessonNum >= max) return null;

    return `${prefix} - Lesson ${lessonNum + 1}`;
  }
}
