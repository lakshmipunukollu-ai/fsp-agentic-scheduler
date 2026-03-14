/**
 * Simulated FSP API Client
 * In production, this would connect to Flight Schedule Pro's REST API.
 * For this demo, it returns realistic simulated data.
 */

export interface FSPStudent {
  id: string;
  name: string;
  email: string;
  totalFlightHours: number;
  lastFlightDate: string;
  nextScheduledFlight?: string;
  currentLesson: string;
  aircraftTypeRatings: string[];
}

export interface FSPInstructor {
  id: string;
  name: string;
  certifications: string[];
  availableSlots: { start: string; end: string }[];
}

export interface FSPAircraft {
  id: string;
  tailNumber: string;
  type: string;
  ifrEquipped: boolean;
  available: boolean;
}

const MOCK_STUDENTS: FSPStudent[] = [
  { id: 'STU-101', name: 'John Smith', email: 'john@example.com', totalFlightHours: 35, lastFlightDate: '2026-03-01', nextScheduledFlight: '2026-03-22', currentLesson: 'Private Pilot - Lesson 12', aircraftTypeRatings: ['C172'] },
  { id: 'STU-102', name: 'Emily Davis', email: 'emily@example.com', totalFlightHours: 52, lastFlightDate: '2026-03-07', nextScheduledFlight: '2026-03-17', currentLesson: 'Private Pilot - Lesson 18', aircraftTypeRatings: ['C172', 'PA28'] },
  { id: 'STU-103', name: 'Alex Turner', email: 'alex@example.com', totalFlightHours: 68, lastFlightDate: '2026-03-11', nextScheduledFlight: '2026-03-28', currentLesson: 'Instrument Rating - Lesson 5', aircraftTypeRatings: ['C172', 'C182'] },
  { id: 'STU-104', name: 'David Wilson', email: 'david@example.com', totalFlightHours: 22, lastFlightDate: '2026-03-13', currentLesson: 'Private Pilot - Lesson 8', aircraftTypeRatings: ['C172'] },
  { id: 'STU-105', name: 'Maria Garcia', email: 'maria@example.com', totalFlightHours: 40, lastFlightDate: '2026-02-21', nextScheduledFlight: '2026-03-25', currentLesson: 'Private Pilot - Lesson 15', aircraftTypeRatings: ['C172'] },
  { id: 'STU-106', name: 'Chris Lee', email: 'chris@example.com', totalFlightHours: 15, lastFlightDate: '2026-03-10', currentLesson: 'Private Pilot - Lesson 5', aircraftTypeRatings: ['C172'] },
  { id: 'STU-107', name: 'Sarah Brown', email: 'sarah@example.com', totalFlightHours: 85, lastFlightDate: '2026-03-12', nextScheduledFlight: '2026-03-19', currentLesson: 'Instrument Rating - Lesson 12', aircraftTypeRatings: ['C172', 'C182', 'PA28'] },
  { id: 'STU-108', name: 'James Taylor', email: 'james@example.com', totalFlightHours: 10, lastFlightDate: '2026-03-05', currentLesson: 'Private Pilot - Lesson 3', aircraftTypeRatings: ['C172'] },
];

const MOCK_INSTRUCTORS: FSPInstructor[] = [
  { id: 'INS-201', name: 'Capt. Sarah Johnson', certifications: ['CFI', 'CFII', 'MEI'], availableSlots: [] },
  { id: 'INS-202', name: 'Capt. Mike Rogers', certifications: ['CFI', 'CFII'], availableSlots: [] },
  { id: 'INS-203', name: 'Capt. Lisa Park', certifications: ['CFI'], availableSlots: [] },
];

const MOCK_AIRCRAFT: FSPAircraft[] = [
  { id: 'AC-301', tailNumber: 'N12345', type: 'C172', ifrEquipped: true, available: true },
  { id: 'AC-302', tailNumber: 'N67890', type: 'C182', ifrEquipped: true, available: true },
  { id: 'AC-303', tailNumber: 'N11223', type: 'PA28', ifrEquipped: false, available: true },
];

export class FSPClient {
  static async getStudents(_operatorFspId: string): Promise<FSPStudent[]> {
    return [...MOCK_STUDENTS];
  }

  static async getStudent(_operatorFspId: string, studentId: string): Promise<FSPStudent | null> {
    return MOCK_STUDENTS.find(s => s.id === studentId) || null;
  }

  static async getInstructors(_operatorFspId: string): Promise<FSPInstructor[]> {
    return [...MOCK_INSTRUCTORS];
  }

  static async getAircraft(_operatorFspId: string): Promise<FSPAircraft[]> {
    return [...MOCK_AIRCRAFT];
  }

  static async getSchedulableEvents(_operatorFspId: string, _params: { locationId: string; dateRange: { start: string; end: string } }): Promise<FSPStudent[]> {
    return MOCK_STUDENTS.filter(s => s.totalFlightHours > 0);
  }

  static async getBatchAvailability(studentIds: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const id of studentIds) {
      result[id] = Math.random() > 0.2; // 80% available
    }
    return result;
  }

  static async validateReservation(_params: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }> {
    return { valid: true, errors: [] };
  }
}
