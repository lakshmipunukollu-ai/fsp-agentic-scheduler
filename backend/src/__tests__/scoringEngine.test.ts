import { ScoringEngine } from '../agents/scoringEngine';
import { FSPStudent } from '../services/fspClient';

const mockStudent: FSPStudent = {
  id: 'STU-101',
  name: 'John Smith',
  email: 'john@example.com',
  totalFlightHours: 35,
  lastFlightDate: '2026-03-01',
  nextScheduledFlight: '2026-03-22',
  currentLesson: 'Private Pilot - Lesson 12',
  aircraftTypeRatings: ['C172'],
};

const defaultWeights = {
  daysSinceLastFlight: 0.3,
  daysUntilNextFlight: 0.2,
  totalFlightHours: 0.1,
  waitlistPosition: 0.4,
};

describe('ScoringEngine', () => {
  describe('score', () => {
    it('should return a CandidateScore with correct structure', () => {
      const result = ScoringEngine.score(mockStudent, defaultWeights, 0);
      expect(result.studentId).toBe('STU-101');
      expect(result.name).toBe('John Smith');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.signals.totalFlightHours).toBe(35);
    });

    it('should give higher scores to students with more days since last flight', () => {
      const recentStudent = { ...mockStudent, lastFlightDate: new Date().toISOString() };
      const oldStudent = { ...mockStudent, lastFlightDate: '2025-01-01' };

      const recentScore = ScoringEngine.score(recentStudent, defaultWeights, 0);
      const oldScore = ScoringEngine.score(oldStudent, defaultWeights, 0);

      expect(oldScore.score).toBeGreaterThan(recentScore.score);
    });

    it('should give higher scores to earlier waitlist positions', () => {
      const firstInLine = ScoringEngine.score(mockStudent, defaultWeights, 0);
      const tenthInLine = ScoringEngine.score(mockStudent, defaultWeights, 9);

      expect(firstInLine.score).toBeGreaterThan(tenthInLine.score);
    });

    it('should give higher scores to students with fewer flight hours', () => {
      const lowHours = { ...mockStudent, totalFlightHours: 5 };
      const highHours = { ...mockStudent, totalFlightHours: 95 };

      const lowScore = ScoringEngine.score(lowHours, defaultWeights, 0);
      const highScore = ScoringEngine.score(highHours, defaultWeights, 0);

      expect(lowScore.score).toBeGreaterThan(highScore.score);
    });
  });

  describe('rankCandidates', () => {
    it('should return sorted candidates by score descending', () => {
      const students: FSPStudent[] = [
        { ...mockStudent, id: 'STU-1', name: 'A', totalFlightHours: 90, lastFlightDate: new Date().toISOString() },
        { ...mockStudent, id: 'STU-2', name: 'B', totalFlightHours: 5, lastFlightDate: '2025-01-01' },
        { ...mockStudent, id: 'STU-3', name: 'C', totalFlightHours: 50, lastFlightDate: '2026-02-01' },
      ];

      const ranked = ScoringEngine.rankCandidates(students, defaultWeights);
      expect(ranked.length).toBe(3);
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
      expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
    });

    it('should handle empty array', () => {
      const ranked = ScoringEngine.rankCandidates([], defaultWeights);
      expect(ranked).toEqual([]);
    });

    it('should handle student without next flight date', () => {
      const student = { ...mockStudent, nextScheduledFlight: undefined };
      const result = ScoringEngine.score(student, defaultWeights, 0);
      expect(result.signals.daysUntilNextFlight).toBe(999);
    });
  });
});
