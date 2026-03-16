import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, requireRole } from '../middleware/auth';
import { SuggestionService } from '../services/suggestionService';
import { assessWeatherForLesson } from '../services/weatherService';
import { query } from '../db/connection';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.use(authenticate);

// POST /api/agent/run - Run the scheduling agent
router.post('/run', requireRole('admin', 'scheduler'), async (req: Request, res: Response) => {
  try {
    const operatorId = req.user!.operatorId;

    // Get current pending count and operator config
    const [pendingResult, operatorResult] = await Promise.all([
      query(`SELECT COUNT(*) FROM suggestions WHERE operator_id = $1 AND status = 'pending'`, [operatorId]),
      query(`SELECT name, config, feature_flags FROM operators WHERE id = $1`, [operatorId]),
    ]);

    const pendingCount = parseInt(pendingResult.rows[0].count, 10);
    const operator = operatorResult.rows[0];

    // Build context for Claude
    const prompt = `You are the Intelligent Scheduling Agent for ${operator.name}, a flight school using Flight Schedule Pro.

Your job is to analyze current scheduling gaps and generate smart scheduling suggestions for the dispatcher to review.

Current state:
- ${pendingCount} suggestions already pending dispatcher review
- Operator config: ${JSON.stringify(operator.config)}
- Feature flags: ${JSON.stringify(operator.feature_flags)}

Available students (simulated roster):
- STU-201: Emma White, 45h total, last flew 10 days ago, next scheduled in 25 days - WAITLIST CANDIDATE
- STU-202: Ryan Chen, 22h total, last flew 3 days ago, completed Lesson 6 yesterday - NEEDS NEXT LESSON
- STU-203: Olivia Brown, 8h total, never had discovery flight converted - DISCOVERY FOLLOW-UP
- STU-204: Marcus Johnson, 78h total, last flew 15 days ago, instrument student - AT RISK

Available slots detected:
- Slot A: Tomorrow 9:00-11:00 AM, Aircraft N12345, Instructor Capt. Sarah Johnson (cancellation from Kyle Davis)
- Slot B: Day after tomorrow 2:00-4:00 PM, Aircraft N67890, Instructor Capt. Mike Rogers (newly opened)
- Slot C: In 3 days 8:00-9:30 AM, Aircraft N11223, Instructor Capt. Lisa Park (maintenance window cleared)

Generate exactly 3 scheduling suggestions. For each, respond with valid JSON only (no markdown, no explanation outside the JSON array).

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
      model: 'claude-sonnet-4-20250514',
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

      const suggestion = await SuggestionService.create(
        operatorId,
        s.type,
        weather.pass ? s.priority : Math.max(10, s.priority - 30),
        s.payload,
        s.rationale,
        24
      );
      created.push(suggestion);
    }

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
      model: 'claude-sonnet-4-20250514',
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
