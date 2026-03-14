# PROJECT BRIEF
# (Extracted from MASTER_PROJECT_PLAYBOOK.md — your section only)

## SENIOR ENGINEER DECISIONS — READ FIRST

Before any code is written, here are the opinionated decisions made across all 9 projects
and why. An agent should never second-guess these unless given new information.

### Stack choices made
| Project | Backend | Frontend | DB | Deploy | Rationale |
|---------|---------|---------|-----|--------|-----------|
| FSP Scheduler | TypeScript + Node.js | React + TypeScript | PostgreSQL (multi-tenant) | Azure Container Apps | TS chosen over C# — same Azure ecosystem, better AI library support, faster iteration |
| Replicated | Python + FastAPI | Next.js 14 | PostgreSQL + S3 | Docker | Python wins for LLM tooling; Next.js for real-time streaming UI |
| ServiceCore | Node.js + Express | Angular (required) | PostgreSQL | Railway | Angular required — clean REST API behind it |
| Zapier | Python + FastAPI | None (API only + optional React dashboard) | PostgreSQL + Redis | Railway | Redis for event queue durability; Python for DX-first API |
| ST6 | Java 21 + Spring Boot | TypeScript micro-frontend (React) | PostgreSQL | Docker | Java required — Spring Boot is the senior choice; React micro-frontend mounts into PA host |
| ZeroPath | Python + FastAPI | React + TypeScript | PostgreSQL | Render | Python for LLM scanning logic; React for triage dashboard |
| Medbridge | Python + FastAPI + LangGraph | None (webhook-driven) | PostgreSQL | Railway | LangGraph is the correct tool for state-machine AI agents |
| CompanyCam | Python + FastAPI | React + TypeScript | PostgreSQL | Render | Python for CV/ML inference; React for annotation UI |
| Upstream | Django + DRF | React + TypeScript | PostgreSQL | Render | Django for rapid e-commerce scaffolding; built-in admin is a bonus |

### The 4 shared modules — build these FIRST
These are the highest ROI pieces of work. Build them once, copy-scaffold into every project.

1. `shared/llm_client.py` — Claude API wrapper with retry, streaming, structured output parsing
2. `shared/auth/` — JWT auth + role-based guards (Python + TypeScript versions)
3. `shared/state_machine.py` — Generic FSM: states, transitions, guards, event log
4. `shared/queue/` — Job queue pattern: enqueue, dequeue, ack, retry (Redis + Postgres fallback)

### Build order (wave system)
**Wave 0 (Day 1):** Build shared modules. All other waves depend on these.
**Wave 1 (Days 2-3):** Zapier + ZeroPath — establish LLM pipeline + REST API patterns
**Wave 2 (Days 4-5):** Medbridge + Replicated — LLM pipeline variants, more complex AI
**Wave 3 (Days 6-8):** FSP + ST6 — complex business logic, approval flows
**Wave 4 (Days 9-11):** ServiceCore + Upstream + CompanyCam — isolated stacks, finish strong

---

## PROJECT 1: FSP AGENTIC SCHEDULER
**Company:** Flight Schedule Pro | **Stack:** TypeScript + Node.js + React + PostgreSQL + Azure

### Company mission to impress
FSP exists to make flight training operations run efficiently. Scheduling is their core product.
The thing that will impress them: an agent that is explainable, auditable, and conservative.
Flight schools are FAA-regulated. Every suggestion must show its reasoning. Never be clever
at the expense of correctness. The approval queue should feel like a premium dispatcher tool,
not a chatbot.

### Architecture
```
Azure Container Apps
├── api-service (Node.js + Express + TypeScript)
│   ├── /api/suggestions          — GET queue of pending suggestions
│   ├── /api/suggestions/:id/approve
│   ├── /api/suggestions/:id/decline
│   ├── /api/operators/:id/config  — per-tenant policy settings
│   └── /api/webhooks/fsp          — receive FSP events
├── agent-service (Node.js + TypeScript)
│   ├── ScheduleWatcher            — polls FSP /schedule every 5 min
│   ├── WaitlistAgent              — fills cancellations
│   ├── RescheduleAgent            — handles cancellations
│   ├── DiscoveryFlightAgent       — books discovery flights
│   └── NextLessonAgent            — schedules after completion
├── notification-service
│   ├── EmailAdapter (FSP native)
│   └── SmsAdapter (Twilio)
└── scheduler-ui (React + TypeScript)
    ├── ApprovalQueue              — bulk approve/decline
    ├── ActivityFeed               — immutable audit log
    └── PolicyConfig               — per-operator weights
```

### Database schema (key tables)
```sql
-- Multi-tenant from day 1. Every table has operator_id.
CREATE TABLE operators (
  id UUID PRIMARY KEY,
  fsp_operator_id TEXT UNIQUE NOT NULL,
  config JSONB DEFAULT '{}',  -- priority weights, search windows, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE suggestions (
  id UUID PRIMARY KEY,
  operator_id UUID REFERENCES operators(id),
  type TEXT NOT NULL,  -- 'waitlist' | 'reschedule' | 'discovery' | 'next_lesson'
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'declined' | 'expired'
  payload JSONB NOT NULL,   -- the proposed reservation data
  rationale JSONB NOT NULL, -- explainability: why this was suggested
  fsp_reservation_id TEXT,  -- set after approval creates reservation in FSP
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id),
  suggestion_id UUID REFERENCES suggestions(id),
  event_type TEXT NOT NULL,
  actor TEXT,  -- 'agent' | 'scheduler:{userId}'
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- audit_log is INSERT-ONLY. Never UPDATE or DELETE.
```

### The rationale object — this is what impresses FSP
```typescript
interface SuggestionRationale {
  trigger: string;           // "Cancellation detected: reservation #12345"
  candidateScore: {
    studentId: string;
    name: string;
    score: number;
    signals: {
      daysSinceLastFlight: number;    // weight applied
      daysUntilNextFlight: number;
      totalFlightHours: number;
      customWeights: Record<string, number>;
    };
  }[];
  constraintsEvaluated: string[];  // ["availability: ✓", "daylight: ✓", "aircraft type: ✓"]
  alternativesConsidered: number;
  confidence: 'high' | 'medium' | 'low';
}
```

### Key agent logic — WaitlistAgent
```typescript
class WaitlistAgent {
  async fillOpening(opening: ScheduleOpening, operator: Operator): Promise<Suggestion[]> {
    // 1. Get all eligible candidates from FSP schedulable events
    const events = await fsp.getSchedulableEvents(operator.fspOperatorId, {
      locationId: opening.locationId,
      dateRange: opening.timeWindow,
    });

    // 2. Fetch availability for all candidates in one batch call
    const availability = await fsp.getBatchAvailability(events.map(e => e.studentId));

    // 3. Score each candidate using operator's configured weights
    const scored = events
      .filter(e => this.meetsConstraints(e, opening, availability))
      .map(e => ({
        event: e,
        score: this.score(e, operator.config.priorityWeights),
        rationale: this.buildRationale(e, opening),
      }))
      .sort((a, b) => b.score - a.score);

    // 4. Take top N and validate against FSP before creating suggestion
    const topN = scored.slice(0, operator.config.suggestionsPerOpening ?? 3);

    const validated = await Promise.allSettled(
      topN.map(candidate =>
        fsp.validateReservation({ ...opening, pilotId: candidate.event.studentId, validateOnly: true })
      )
    );

    // 5. Only surface candidates that pass FSP validation
    return validated
      .map((result, i) => result.status === 'fulfilled' ? this.toSuggestion(topN[i], opening) : null)
      .filter(Boolean);
  }
}
```

### Feature flags (per-tenant rollout)
```typescript
// Use a simple JSONB flags column on operators table
// Never roll out a new agent behavior to all tenants at once
const flags = {
  "waitlist_automation": true,
  "reschedule_on_cancellation": false,  // roll out after waitlist is proven
  "discovery_flight_booking": false,
  "auto_approve_low_risk": false,        // Phase 2 only
};
```

### CLAUDE.md for FSP agent
```
You are a senior TypeScript engineer building the Agentic Scheduler for Flight Schedule Pro.

COMPANY MISSION: Help flight schools schedule more efficiently so students progress faster
and schools earn more revenue. Every scheduling decision has real safety implications (FAA).

CORE PRINCIPLES FOR THIS PROJECT:
- Explainability over cleverness. Every suggestion must include a rationale object.
- Conservative > aggressive. If a suggestion might be wrong, don't surface it.
- Audit everything. Every state change writes to audit_log. No exceptions.
- Multi-tenant by default. operator_id is on every query. Never leak data between tenants.
- Phase 1 is suggest-only. Do NOT build auto-approval. That is Phase 2.

TECH STACK: TypeScript (strict mode), Node.js, PostgreSQL, Azure Container Apps
NEVER: Skip input validation, omit operator_id from DB queries, auto-apply suggestions
ALWAYS: Write rationale for every suggestion, validate with FSP before creating suggestions
```

---


## SHARED MODULES — BUILD THESE IN WAVE 0

### shared/llm_client.py
```python
"""
Shared Claude API client. Used by: Replicated, ZeroPath, Medbridge, CompanyCam, FSP, Upstream.
Copy this file into each Python project that needs it.
"""
import anthropic
from tenacity import retry, stop_after_attempt, wait_exponential
import json

client = anthropic.Anthropic()

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
async def complete(
    prompt: str,
    system: str = "",
    model: str = "claude-sonnet-4-20250514",
    max_tokens: int = 4096,
    as_json: bool = False,
) -> str | dict:
    message = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    text = message.content[0].text
    if as_json:
        # Strip markdown fences if present
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(clean)
    return text

async def analyze_image(
    image_b64: str,
    prompt: str,
    system: str = "",
    model: str = "claude-sonnet-4-20250514",
) -> dict:
    message = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    return json.loads(message.content[0].text)
```

### shared/auth.py (Python version)
```python
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = os.getenv("JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def create_access_token(user_id: str, role: str) -> str:
    return jwt.encode(
        {"sub": user_id, "role": role, "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)},
        SECRET_KEY, algorithm=ALGORITHM
    )

def require_role(*roles: str):
    def dependency(token: str = Depends(oauth2_scheme)):
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            if payload.get("role") not in roles:
                raise HTTPException(status_code=403, detail="Insufficient permissions")
            return payload
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")
    return dependency

# Usage: @router.get("/admin", dependencies=[Depends(require_role("admin", "manager"))])
```

### shared/state_machine.py
```python
from dataclasses import dataclass
from typing import Generic, TypeVar, Callable
from datetime import datetime

S = TypeVar('S')  # State type
E = TypeVar('E')  # Event type

@dataclass
class Transition(Generic[S, E]):
    from_state: S
    event: E
    to_state: S
    guard: Callable | None = None  # optional condition function

class StateMachine(Generic[S, E]):
    def __init__(self, initial: S, transitions: list[Transition]):
        self.state = initial
        self._transitions = {(t.from_state, t.event): t for t in transitions}
        self._log: list[dict] = []

    def transition(self, event: E, context: dict = None) -> S:
        key = (self.state, event)
        t = self._transitions.get(key)
        if not t:
            raise ValueError(f"Invalid transition: {self.state} + {event}")
        if t.guard and not t.guard(context or {}):
            raise ValueError(f"Guard failed: {self.state} + {event}")
        prev = self.state
        self.state = t.to_state
        self._log.append({"from": prev, "event": event, "to": self.state, "at": datetime.utcnow().isoformat()})
        return self.state

    @property
    def history(self) -> list[dict]:
        return self._log.copy()
```

---
