import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, requireRole } from '../middleware/auth';
import { SuggestionService } from '../services/suggestionService';
import { AuditService } from '../services/auditService';
import { assessWeatherForLesson } from '../services/weatherService';
import { query } from '../db/connection';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Rate limiting: track last run time per operator (30-second cooldown)
const lastRunTime = new Map<string, number>();
const RUN_COOLDOWN_MS = 30_000;

router.use(authenticate);

// POST /api/agent/run - Run the scheduling agent
router.post('/run', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    // Rate limit: 30-second cooldown per operator
    const lastRun = lastRunTime.get(operatorId) || 0;
    const elapsed = Date.now() - lastRun;
    if (elapsed < RUN_COOLDOWN_MS) {
      const waitSec = Math.ceil((RUN_COOLDOWN_MS - elapsed) / 1000);
      res.status(429).json({ error: `Agent is cooling down. Try again in ${waitSec}s.`, retryAfterSeconds: waitSec });
      return;
    }
    lastRunTime.set(operatorId, Date.now());

    // Get current pending count, operator config, and real student data
    const [pendingResult, operatorResult, studentsResult, slotsResult] = await Promise.all([
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'pending'`, [operatorId]),
      query(`SELECT name, config, feature_flags FROM operators WHERE id = $1`, [operatorId]),
      query(`
        SELECT
          u.id, u.name, sp.license_type, sp.hours_logged, sp.hours_required,
          COUNT(sl.id) FILTER (WHERE sl.start_time >= NOW() - INTERVAL '30 days' AND sl.status = 'completed') AS flights_30d,
          MAX(sl.start_time) FILTER (WHERE sl.status = 'completed') AS last_flight,
          (SELECT s2.start_time FROM scheduled_lessons s2
           WHERE s2.user_id = u.id AND s2.status = 'confirmed' AND s2.start_time > NOW()
           ORDER BY s2.start_time LIMIT 1) AS next_scheduled
        FROM student_profiles sp
        JOIN users u ON u.id = sp.user_id
        LEFT JOIN scheduled_lessons sl ON sl.user_id = sp.user_id AND sl.operator_id = sp.operator_id
        WHERE sp.operator_id = $1
        GROUP BY u.id, u.name, sp.license_type, sp.hours_logged, sp.hours_required
        ORDER BY flights_30d ASC, last_flight ASC NULLS FIRST
        LIMIT 8
      `, [operatorId]),
      query(`
        SELECT aircraft_tail, instructor_name,
               start_time AT TIME ZONE 'UTC' AS start_time,
               end_time AT TIME ZONE 'UTC' AS end_time
        FROM scheduled_lessons
        WHERE operator_id = $1
          AND status = 'confirmed'
          AND start_time BETWEEN NOW() AND NOW() + INTERVAL '7 days'
        ORDER BY start_time LIMIT 5
      `, [operatorId]),
    ]);

    const pendingCount = parseInt(pendingResult.rows[0].count, 10);
    const operator = operatorResult.rows[0];

    // Build student context from real DB data
    const studentLines = studentsResult.rows.map((s: {
      id: string; name: string; license_type: string;
      hours_logged: number; hours_required: number;
      flights_30d: number; last_flight: string | null; next_scheduled: string | null;
    }) => {
      const daysSinceLast = s.last_flight
        ? Math.floor((Date.now() - new Date(s.last_flight).getTime()) / 86400000)
        : 999;
      const daysUntilNext = s.next_scheduled
        ? Math.floor((new Date(s.next_scheduled).getTime() - Date.now()) / 86400000)
        : 999;
      const tag = daysSinceLast > 14 ? 'AT RISK'
        : daysUntilNext > 20 ? 'WAITLIST CANDIDATE'
        : Number(s.flights_30d) < 2 ? 'LOW FREQUENCY'
        : 'OK';
      return `- ${s.id}: ${s.name}, ${s.license_type}, ${s.hours_logged}h / ${s.hours_required}h req, ` +
             `last flew ${daysSinceLast === 999 ? 'never' : daysSinceLast + 'd ago'}, ` +
             `next in ${daysUntilNext === 999 ? 'unscheduled' : daysUntilNext + 'd'}, ` +
             `${s.flights_30d} flights/30d — ${tag}`;
    }).join('\n');

    // Determine available slots: upcoming confirmed slots + one synthetic cancellation slot
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
    const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2); dayAfter.setHours(14, 0, 0, 0);
    const in3Days = new Date(); in3Days.setDate(in3Days.getDate() + 3); in3Days.setHours(8, 0, 0, 0);
    const slotLines = slotsResult.rows.length > 0
      ? slotsResult.rows.map((sl: { aircraft_tail: string; instructor_name: string; start_time: string; end_time: string }, i: number) =>
          `- Slot ${String.fromCharCode(65 + i)}: ${sl.start_time}, Aircraft ${sl.aircraft_tail}, Instructor ${sl.instructor_name} (upcoming confirmed)`
        ).join('\n')
      : `- Slot A: ${tomorrow.toISOString()}, Aircraft N12345, Instructor Capt. Sarah Johnson (cancellation fill)
- Slot B: ${dayAfter.toISOString()}, Aircraft N67890, Instructor Capt. Mike Rogers (newly opened)
- Slot C: ${in3Days.toISOString()}, Aircraft N11223, Instructor Capt. Lisa Park (maintenance cleared)`;

    // Build context for Claude
    const prompt = `You are the Intelligent Scheduling Agent for ${operator.name}, a flight school using Flight Schedule Pro.

Your job is to analyze current scheduling gaps and generate smart scheduling suggestions for the dispatcher to review.

Current state:
- ${pendingCount} suggestions already pending dispatcher review
- Operator config: ${JSON.stringify(operator.config)}
- Feature flags: ${JSON.stringify(operator.feature_flags)}

Enrolled students (live data from database):
${studentLines}

Available open slots:
${slotLines}

Generate exactly 3 scheduling suggestions prioritizing students tagged AT RISK or WAITLIST CANDIDATE. For each, respond with valid JSON only (no markdown, no explanation outside the JSON array).

Return a JSON array of 3 objects with this exact structure:
[
  {
    "type": "waitlist|reschedule|discovery|next_lesson",
    "priority": <number 50-100>,
    "payload": {
      "studentId": "<id>",
      "studentName": "<name>",
      "instructorId": "INS-201",
      "instructorName": "<name>",
      "aircraftId": "AC-301",
      "aircraftTail": "<tail>",
      "startTime": "<ISO timestamp>",
      "endTime": "<ISO timestamp>",
      "lessonType": "<description>",
      "locationId": "LOC-001"
    },
    "rationale": {
      "trigger": "<what triggered this suggestion>",
      "candidateScore": [
        {
          "studentId": "<id>",
          "name": "<name>",
          "score": <0-1>,
          "signals": {
            "daysSinceLastFlight": <number>,
            "daysUntilNextFlight": <number>,
            "totalFlightHours": <number>,
            "customWeights": {}
          }
        }
      ],
      "constraintsEvaluated": ["<constraint>: pass|fail"],
      "alternativesConsidered": <number>,
      "confidence": "high|medium|low"
    }
  }
]`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    let suggestions;
    try {
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      suggestions = JSON.parse(cleaned);
    } catch {
      res.status(500).json({ error: 'Agent returned invalid response' });
      return;
    }

    const created = [];
    for (const s of suggestions) {
      // Real weather check for each suggested slot
      const weatherDate = s.payload?.startTime || new Date().toISOString();
      const weather = await assessWeatherForLesson(weatherDate);

      // Inject real weather into constraints
      if (s.rationale?.constraintsEvaluated) {
        s.rationale.constraintsEvaluated = s.rationale.constraintsEvaluated.filter(
          (c: string) => !c.toLowerCase().includes('weather')
        );
        s.rationale.constraintsEvaluated.push(
          `weather forecast: ${weather.pass ? 'pass' : 'FAIL'} — ${weather.condition}`
        );
      }

      // Retry logic: if weather fails, attempt to find next-best candidate
      let candidatesTried = s.rationale?.candidateScore?.length || 1;
      if (!weather.pass && s.rationale?.candidateScore?.length > 1) {
        // Try next candidate in the score list
        const nextCandidate = s.rationale.candidateScore[1];
        s.payload.studentId = nextCandidate.studentId;
        s.payload.studentName = nextCandidate.name;
        s.rationale.candidateScore = [nextCandidate, ...s.rationale.candidateScore.slice(2)];
        s.rationale.trigger = `${s.rationale.trigger} [retried: weather fail on first candidate, switched to next-best]`;
        candidatesTried++;
      }

      // Generate AI natural language summary for the rationale
      try {
        const topCandidate = s.rationale?.candidateScore?.[0];
        const nlPrompt = `Write 2 concise sentences (max 40 words each) explaining why ${s.payload?.studentName} was selected for this ${s.type?.replace(/_/g, ' ')} slot.
Facts: score ${Math.round((topCandidate?.score || 0) * 100)}/100, ${topCandidate?.signals?.daysSinceLastFlight || 0} days since last flight, ${topCandidate?.signals?.totalFlightHours || 0}h total, ${s.rationale?.alternativesConsidered || 0} candidates evaluated, confidence: ${s.rationale?.confidence}, weather: ${weather.pass ? 'clear' : 'poor'}.
Be specific and professional. No bullet points.`;
        const nlMsg = await anthropic.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 120,
          messages: [{ role: 'user', content: nlPrompt }],
        });
        s.rationale.summary = nlMsg.content[0].type === 'text' ? nlMsg.content[0].text.trim() : '';
      } catch {
        s.rationale.summary = '';
      }

      const suggestion = await SuggestionService.create(
        operatorId,
        s.type,
        weather.pass ? s.priority : Math.max(10, s.priority - 30),
        s.payload,
        s.rationale,
        24,
        candidatesTried
      );
      created.push(suggestion);
    }

    // Log agent run to audit trail so "last run" and narrative counts work
    await AuditService.log(operatorId, 'agent_run', `scheduler:${req.user!.sub}`, undefined, {
      openings_scanned: 3,
      suggestions_created: created.length,
    });

    res.json({ created: created.length, suggestions: created });
  } catch (error) {
    console.error('Agent run error:', error);
    res.status(500).json({ error: 'Agent run failed' });
  }
});

// POST /api/agent/decline-explanation - Get AI explanation for a decline
router.post('/decline-explanation', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const { suggestionId } = req.body;
    const operatorId = req.user!.operatorId;

    const result = await query(
      'SELECT * FROM suggestions WHERE id = $1 AND operator_id = $2',
      [suggestionId, operatorId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Suggestion not found' });
      return;
    }

    const s = result.rows[0];
    const payload = s.payload as { studentName?: string; lessonType?: string };
    const rationale = s.rationale as { trigger?: string; confidence?: string; constraintsEvaluated?: string[]; candidateScore?: { score?: number }[] };

    const prompt = `You are an AI scheduling assistant for a flight school using Flight Schedule Pro.

A dispatcher is about to decline this scheduling suggestion. Briefly explain in 2-3 sentences:
1. Why this suggestion might not be the best fit
2. What the agent will try differently next time

Suggestion details:
- Type: ${s.type}
- Student: ${payload.studentName}
- Lesson: ${payload.lessonType}
- Confidence: ${rationale.confidence}
- Trigger: ${rationale.trigger}
- Constraints: ${Array.isArray(rationale.constraintsEvaluated) ? rationale.constraintsEvaluated.join(', ') : ''}
- Candidate score: ${rationale.candidateScore?.[0]?.score ?? 'N/A'}

Keep it concise, professional, and helpful for the dispatcher. No bullet points, just 2-3 sentences.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const explanation = message.content[0].type === 'text' ? message.content[0].text : '';
    res.json({ explanation });
  } catch (error) {
    console.error('Decline explanation error:', error);
    res.status(500).json({ error: 'Failed to generate explanation' });
  }
});

export default router;
