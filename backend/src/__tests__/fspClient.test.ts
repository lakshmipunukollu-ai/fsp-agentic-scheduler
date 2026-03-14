import { FSPClient } from '../services/fspClient';

describe('FSPClient (simulated)', () => {
  it('should return a list of students', async () => {
    const students = await FSPClient.getStudents('FSP-001');
    expect(students.length).toBeGreaterThan(0);
    expect(students[0].id).toBeDefined();
    expect(students[0].name).toBeDefined();
    expect(students[0].totalFlightHours).toBeDefined();
  });

  it('should return a student by ID', async () => {
    const student = await FSPClient.getStudent('FSP-001', 'STU-101');
    expect(student).toBeDefined();
    expect(student?.name).toBe('John Smith');
  });

  it('should return null for unknown student ID', async () => {
    const student = await FSPClient.getStudent('FSP-001', 'UNKNOWN');
    expect(student).toBeNull();
  });

  it('should return instructors', async () => {
    const instructors = await FSPClient.getInstructors('FSP-001');
    expect(instructors.length).toBeGreaterThan(0);
    expect(instructors[0].certifications).toBeDefined();
  });

  it('should return aircraft', async () => {
    const aircraft = await FSPClient.getAircraft('FSP-001');
    expect(aircraft.length).toBeGreaterThan(0);
    expect(aircraft[0].tailNumber).toBeDefined();
  });

  it('should return schedulable events', async () => {
    const events = await FSPClient.getSchedulableEvents('FSP-001', {
      locationId: 'LOC-001',
      dateRange: { start: '2026-03-14', end: '2026-03-21' },
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it('should return batch availability', async () => {
    const availability = await FSPClient.getBatchAvailability(['STU-101', 'STU-102']);
    expect(Object.keys(availability).length).toBe(2);
    expect(typeof availability['STU-101']).toBe('boolean');
  });

  it('should validate reservation', async () => {
    const result = await FSPClient.validateReservation({ studentId: 'STU-101' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
