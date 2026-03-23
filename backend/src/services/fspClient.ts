/**
 * FSP API Client
 * FSP_API_MODE=mock  — returns jittered simulation data (default)
 * FSP_API_MODE=live  — connects to real FSP REST API (requires FSP_API_BASE_URL + FSP_API_TOKEN)
 */

const FSP_API_MODE = process.env.FSP_API_MODE || 'mock';
const FSP_API_BASE_URL = process.env.FSP_API_BASE_URL || '';
const FSP_API_TOKEN = process.env.FSP_API_TOKEN || '';

export interface FSPStudent {
  id: string;
  name: string;
  email: string;
  totalFlightHours: number;
  lastFlightDate: string;
  nextScheduledFlight?: string;
  currentLesson: string;
  aircraftTypeRatings: string[];
  daysSinceLastFlight?: number;
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

function jitter(base: number, range: number): number {
  return Math.max(0, base + Math.floor(Math.random() * range * 2) - range);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

const BASE_STUDENTS = [
  { id: 'STU-101', name: 'John Smith', email: 'john@example.com', baseHours: 35, baseLastFlight: 19, baseNextFlight: 2, currentLesson: 'Private Pilot - Lesson 12', aircraftTypeRatings: ['C172'] },
  { id: 'STU-102', name: 'Emily Davis', email: 'emily@example.com', baseHours: 52, baseLastFlight: 13, baseNextFlight: -3, currentLesson: 'Private Pilot - Lesson 18', aircraftTypeRatings: ['C172', 'PA28'] },
  { id: 'STU-103', name: 'Alex Turner', email: 'alex@example.com', baseHours: 68, baseLastFlight: 9, baseNextFlight: 8, currentLesson: 'Instrument Rating - Lesson 5', aircraftTypeRatings: ['C172', 'C182'] },
  { id: 'STU-104', name: 'David Wilson', email: 'david@example.com', baseHours: 22, baseLastFlight: 7, baseNextFlight: null, currentLesson: 'Private Pilot - Lesson 8', aircraftTypeRatings: ['C172'] },
  { id: 'STU-105', name: 'Maria Garcia', email: 'maria@example.com', baseHours: 40, baseLastFlight: 27, baseNextFlight: 5, currentLesson: 'Private Pilot - Lesson 15', aircraftTypeRatings: ['C172'] },
  { id: 'STU-106', name: 'Chris Lee', email: 'chris@example.com', baseHours: 15, baseLastFlight: 10, baseNextFlight: null, currentLesson: 'Private Pilot - Lesson 5', aircraftTypeRatings: ['C172'] },
  { id: 'STU-107', name: 'Sarah Brown', email: 'sarah@example.com', baseHours: 85, baseLastFlight: 8, baseNextFlight: -1, currentLesson: 'Instrument Rating - Lesson 12', aircraftTypeRatings: ['C172', 'C182', 'PA28'] },
  { id: 'STU-108', name: 'James Taylor', email: 'james@example.com', baseHours: 10, baseLastFlight: 15, baseNextFlight: null, currentLesson: 'Private Pilot - Lesson 3', aircraftTypeRatings: ['C172'] },
];

function buildMockStudents(): FSPStudent[] {
  return BASE_STUDENTS.map(s => {
    const lastFlightDays = jitter(s.baseLastFlight, 3);
    const nextFlightDays = s.baseNextFlight !== null ? jitter(s.baseNextFlight, 2) : null;
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      totalFlightHours: jitter(s.baseHours, 2),
      lastFlightDate: daysAgo(lastFlightDays),
      nextScheduledFlight: nextFlightDays !== null && nextFlightDays > 0 ? daysFromNow(nextFlightDays) : undefined,
      currentLesson: s.currentLesson,
      aircraftTypeRatings: s.aircraftTypeRatings,
      daysSinceLastFlight: lastFlightDays,
    };
  });
}

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

async function liveRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${FSP_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${FSP_API_TOKEN}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`FSP API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export class FSPClient {
  static async getStudents(operatorFspId: string): Promise<FSPStudent[]> {
    if (FSP_API_MODE === 'live') {
      return liveRequest<FSPStudent[]>(`/operators/${operatorFspId}/students`);
    }
    return buildMockStudents();
  }

  static async getStudent(operatorFspId: string, studentId: string): Promise<FSPStudent | null> {
    if (FSP_API_MODE === 'live') {
      return liveRequest<FSPStudent>(`/operators/${operatorFspId}/students/${studentId}`);
    }
    return buildMockStudents().find(s => s.id === studentId) || null;
  }

  static async getInstructors(operatorFspId: string): Promise<FSPInstructor[]> {
    if (FSP_API_MODE === 'live') {
      return liveRequest<FSPInstructor[]>(`/operators/${operatorFspId}/instructors`);
    }
    return [...MOCK_INSTRUCTORS];
  }

  static async getAircraft(operatorFspId: string): Promise<FSPAircraft[]> {
    if (FSP_API_MODE === 'live') {
      return liveRequest<FSPAircraft[]>(`/operators/${operatorFspId}/aircraft`);
    }
    return [...MOCK_AIRCRAFT];
  }

  static async getSchedulableEvents(_operatorFspId: string, _params: { locationId: string; dateRange: { start: string; end: string } }): Promise<FSPStudent[]> {
    return buildMockStudents().filter(s => s.totalFlightHours > 0);
  }

  static async getBatchAvailability(studentIds: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const id of studentIds) {
      result[id] = Math.random() > 0.2;
    }
    return result;
  }

  static async validateReservation(_params: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }> {
    return { valid: true, errors: [] };
  }
}
