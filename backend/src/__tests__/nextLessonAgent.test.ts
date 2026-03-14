import { NextLessonAgent } from '../agents/nextLessonAgent';

// Access private method via prototype
describe('NextLessonAgent', () => {
  describe('getNextLesson', () => {
    // Access private static method
    const getNextLesson = (NextLessonAgent as any).getNextLesson.bind(NextLessonAgent);

    it('should return next lesson number', () => {
      expect(getNextLesson('Private Pilot - Lesson 5')).toBe('Private Pilot - Lesson 6');
    });

    it('should return null at max lesson', () => {
      expect(getNextLesson('Private Pilot - Lesson 20')).toBeNull();
    });

    it('should handle instrument rating', () => {
      expect(getNextLesson('Instrument Rating - Lesson 10')).toBe('Instrument Rating - Lesson 11');
    });

    it('should return null at instrument rating max', () => {
      expect(getNextLesson('Instrument Rating - Lesson 15')).toBeNull();
    });

    it('should return null for invalid format', () => {
      expect(getNextLesson('Unknown course')).toBeNull();
    });
  });
});
