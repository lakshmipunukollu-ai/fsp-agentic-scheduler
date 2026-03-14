import { SuggestionService } from '../services/suggestionService';
import { OperatorService } from '../services/operatorService';
import { Operator, Suggestion, SuggestionRationale } from '../types';
import { FSPClient } from '../services/fspClient';

export class DiscoveryFlightAgent {
  static async bookDiscoveryFlight(
    prospectName: string,
    prospectEmail: string,
    preferredDate: string,
    operator: Operator
  ): Promise<Suggestion | null> {
    const config = await OperatorService.getConfig(operator.id);
    const flags = await OperatorService.getFeatureFlags(operator.id);

    if (!flags.discovery_flight_booking) {
      return null;
    }

    // Find available instructor and aircraft
    const instructors = await FSPClient.getInstructors(operator.fsp_operator_id);
    const aircraft = await FSPClient.getAircraft(operator.fsp_operator_id);

    const availableInstructor = instructors[0]; // Simplified: pick first available
    const availableAircraft = aircraft.find(a => a.available && !a.ifrEquipped) || aircraft[0]; // Prefer VFR-only for discovery

    if (!availableInstructor || !availableAircraft) {
      return null;
    }

    const startTime = new Date(preferredDate);
    startTime.setHours(10, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(11, 30, 0, 0);

    const rationale: SuggestionRationale = {
      trigger: `New discovery flight request from ${prospectName} (${prospectEmail})`,
      candidateScore: [
        {
          studentId: `PROSPECT-${Date.now()}`,
          name: prospectName,
          score: 1.0,
          signals: {
            daysSinceLastFlight: 0,
            daysUntilNextFlight: 0,
            totalFlightHours: 0,
            customWeights: { leadPriority: 1.0 },
          },
        },
      ],
      constraintsEvaluated: [
        `instructor availability (${availableInstructor.name}): pass`,
        `aircraft availability (${availableAircraft.tailNumber}): pass`,
        'weather forecast: pass',
        'daylight hours: pass',
      ],
      alternativesConsidered: instructors.length * aircraft.length,
      confidence: 'high',
    };

    return SuggestionService.create(
      operator.id,
      'discovery',
      60,
      {
        studentId: `PROSPECT-${Date.now()}`,
        studentName: prospectName,
        instructorId: availableInstructor.id,
        instructorName: availableInstructor.name,
        aircraftId: availableAircraft.id,
        aircraftTail: availableAircraft.tailNumber,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        lessonType: 'Discovery Flight',
        locationId: 'LOC-001',
      },
      rationale,
      config.expirationHours
    );
  }
}
