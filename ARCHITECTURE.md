# FSP Agentic Scheduler — Architecture Document

## Overview

The FSP Agentic Scheduler is a multi-tenant scheduling assistant for flight training operations. It monitors Flight Schedule Pro (FSP) for scheduling opportunities (cancellations, waitlist openings, discovery flight requests, lesson completions) and generates explainable, auditable suggestions for dispatchers to approve or decline.

**Core philosophy:** Explainability over cleverness. Conservative over aggressive. Audit everything.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend API | TypeScript + Node.js + Express |
| Agent Service | TypeScript + Node.js (same process, modular) |
| Frontend | React + TypeScript (Vite) |
| Database | PostgreSQL (multi-tenant, operator_id on every table) |
| Auth | JWT (HS256) |
| Deployment | Azure Container Apps |

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                  React Frontend                  │
│  ┌──────────────┐ ┌────────────┐ ┌────────────┐ │
│  │ApprovalQueue │ │ActivityFeed│ │PolicyConfig│ │
│  └──────────────┘ └────────────┘ └────────────┘ │
└───────────────────────┬─────────────────────────┘
                        │ REST API
┌───────────────────────┴─────────────────────────┐
│              Express API Service                 │
│  ┌─────────┐ ┌────────────┐ ┌─────────────────┐ │
│  │Auth/JWT │ │Suggestions │ │Operators/Config │ │
│  │Middleware│ │  Routes    │ │   Routes        │ │
│  └─────────┘ └────────────┘ └─────────────────┘ │
│  ┌────────────────────────────────────────────┐  │
│  │           Agent Engine                     │  │
│  │ ┌──────────┐ ┌───────────┐ ┌────────────┐ │  │
│  │ │Waitlist  │ │Reschedule │ │Discovery   │ │  │
│  │ │Agent     │ │Agent      │ │FlightAgent │ │  │
│  │ ├──────────┤ ├───────────┤ ├────────────┤ │  │
│  │ │NextLesson│ │Schedule   │ │Scoring     │ │  │
│  │ │Agent     │ │Watcher    │ │Engine      │ │  │
│  │ └──────────┘ └───────────┘ └────────────┘ │  │
│  └────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────┘
                        │
              ┌─────────┴─────────┐
              │   PostgreSQL DB   │
              │  (multi-tenant)   │
              └───────────────────┘
```

## Database Schema

### operators
```sql
CREATE TABLE operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fsp_operator_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  feature_flags JSONB DEFAULT '{"waitlist_automation": true, "reschedule_on_cancellation": false, "discovery_flight_booking": false, "auto_approve_low_risk": false}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'scheduler',  -- 'admin' | 'scheduler' | 'viewer'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### suggestions
```sql
CREATE TABLE suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  type TEXT NOT NULL CHECK (type IN ('waitlist', 'reschedule', 'discovery', 'next_lesson')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
  priority INTEGER DEFAULT 0,
  payload JSONB NOT NULL,
  rationale JSONB NOT NULL,
  fsp_reservation_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id)
);

CREATE INDEX idx_suggestions_operator_status ON suggestions(operator_id, status);
CREATE INDEX idx_suggestions_created ON suggestions(created_at DESC);
```

### audit_log
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  suggestion_id UUID REFERENCES suggestions(id),
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,  -- 'agent' | 'scheduler:{userId}'
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- INSERT-ONLY. Never UPDATE or DELETE.

CREATE INDEX idx_audit_log_operator ON audit_log(operator_id, created_at DESC);
CREATE INDEX idx_audit_log_suggestion ON audit_log(suggestion_id);
```

### schedule_events
```sql
CREATE TABLE schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id),
  fsp_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'cancellation' | 'completion' | 'new_booking' | 'waitlist_add'
  event_data JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedule_events_unprocessed ON schedule_events(operator_id, processed) WHERE NOT processed;
```

## API Contracts

### Authentication

```
POST /api/auth/login
  Body: { email: string, password: string }
  Response: { token: string, user: { id, name, email, role, operatorId } }

POST /api/auth/register
  Body: { email: string, password: string, name: string, operatorId: string }
  Response: { token: string, user: { id, name, email, role, operatorId } }
```

### Health

```
GET /health
  Response: { status: "ok", timestamp: string, version: string }
```

### Suggestions

```
GET /api/suggestions
  Headers: Authorization: Bearer <token>
  Query: ?status=pending&type=waitlist&page=1&limit=20
  Response: { data: Suggestion[], total: number, page: number, limit: number }

GET /api/suggestions/:id
  Response: { data: Suggestion }

POST /api/suggestions/:id/approve
  Body: { notes?: string }
  Response: { data: Suggestion }  // status changed to 'approved'

POST /api/suggestions/:id/decline
  Body: { reason?: string }
  Response: { data: Suggestion }  // status changed to 'declined'

POST /api/suggestions/bulk-approve
  Body: { ids: string[] }
  Response: { approved: number, failed: string[] }

POST /api/suggestions/bulk-decline
  Body: { ids: string[], reason?: string }
  Response: { declined: number, failed: string[] }
```

### Operators / Config

```
GET /api/operators/:id/config
  Response: { data: OperatorConfig }

PUT /api/operators/:id/config
  Body: OperatorConfig (partial)
  Response: { data: OperatorConfig }

GET /api/operators/:id/feature-flags
  Response: { data: FeatureFlags }

PUT /api/operators/:id/feature-flags
  Body: FeatureFlags (partial)
  Response: { data: FeatureFlags }
```

### Audit Log

```
GET /api/audit-log
  Query: ?suggestion_id=<uuid>&page=1&limit=50
  Response: { data: AuditEntry[], total: number }
```

### Dashboard Stats

```
GET /api/dashboard/stats
  Response: {
    pending: number,
    approvedToday: number,
    declinedToday: number,
    avgResponseTime: number,
    suggestionsByType: Record<string, number>
  }
```

### Webhooks (from FSP)

```
POST /api/webhooks/fsp
  Body: FSPWebhookEvent
  Response: { received: true }
```

## Data Models (TypeScript)

```typescript
interface Operator {
  id: string;
  fspOperatorId: string;
  name: string;
  config: OperatorConfig;
  featureFlags: FeatureFlags;
  createdAt: string;
  updatedAt: string;
}

interface OperatorConfig {
  priorityWeights: {
    daysSinceLastFlight: number;  // default 0.3
    daysUntilNextFlight: number;  // default 0.2
    totalFlightHours: number;     // default 0.1
    waitlistPosition: number;     // default 0.4
  };
  suggestionsPerOpening: number;  // default 3
  searchWindowDays: number;       // default 7
  expirationHours: number;        // default 24
}

interface FeatureFlags {
  waitlist_automation: boolean;
  reschedule_on_cancellation: boolean;
  discovery_flight_booking: boolean;
  auto_approve_low_risk: boolean;
}

interface Suggestion {
  id: string;
  operatorId: string;
  type: 'waitlist' | 'reschedule' | 'discovery' | 'next_lesson';
  status: 'pending' | 'approved' | 'declined' | 'expired';
  priority: number;
  payload: SuggestionPayload;
  rationale: SuggestionRationale;
  fspReservationId?: string;
  expiresAt?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

interface SuggestionPayload {
  studentId: string;
  studentName: string;
  instructorId?: string;
  instructorName?: string;
  aircraftId?: string;
  aircraftTail?: string;
  startTime: string;
  endTime: string;
  lessonType?: string;
  locationId?: string;
}

interface SuggestionRationale {
  trigger: string;
  candidateScore: CandidateScore[];
  constraintsEvaluated: string[];
  alternativesConsidered: number;
  confidence: 'high' | 'medium' | 'low';
}

interface CandidateScore {
  studentId: string;
  name: string;
  score: number;
  signals: {
    daysSinceLastFlight: number;
    daysUntilNextFlight: number;
    totalFlightHours: number;
    customWeights: Record<string, number>;
  };
}

interface AuditEntry {
  id: string;
  operatorId: string;
  suggestionId?: string;
  eventType: string;
  actor: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

interface User {
  id: string;
  operatorId: string;
  email: string;
  name: string;
  role: 'admin' | 'scheduler' | 'viewer';
  createdAt: string;
}
```

## Agent Architecture

### ScheduleWatcher
- Runs on a configurable interval (default: 5 minutes)
- Checks for new schedule events (cancellations, completions)
- Dispatches events to the appropriate agent

### WaitlistAgent
1. Triggered by cancellation events
2. Fetches eligible candidates (simulated FSP API)
3. Scores candidates using operator-configured weights
4. Validates constraints (availability, daylight, aircraft type, FAA)
5. Creates suggestion with full rationale
6. Logs to audit_log

### RescheduleAgent
1. Triggered by cancellation with existing student
2. Finds alternative time slots
3. Scores by proximity to original time, instructor availability
4. Creates reschedule suggestion

### DiscoveryFlightAgent
1. Triggered by new discovery flight requests
2. Finds available instructor + aircraft + time
3. Prioritizes quick booking (discovery flights are sales opportunities)

### NextLessonAgent
1. Triggered by lesson completion events
2. Determines next lesson in syllabus
3. Finds available slots within configured window
4. Creates next_lesson suggestion

### Scoring Engine
```
score = Σ(weight_i × normalized_signal_i)

Default weights:
  daysSinceLastFlight: 0.3  (higher = more urgent)
  daysUntilNextFlight: 0.2  (farther out = more flexible)
  totalFlightHours: 0.1     (lower hours = needs more flights)
  waitlistPosition: 0.4     (first come, first served bias)
```

## Security

- JWT tokens with 24-hour expiration
- Role-based access: admin (full), scheduler (approve/decline), viewer (read-only)
- operator_id enforced on every database query (tenant isolation)
- Passwords hashed with bcrypt
- All secrets from environment variables (.env)
- CORS configured for frontend origin only

## Project Structure

```
/
├── backend/
│   ├── src/
│   │   ├── index.ts              -- Express app entry
│   │   ├── config.ts             -- env config
│   │   ├── db/
│   │   │   ├── connection.ts     -- pg pool
│   │   │   ├── migrations/       -- SQL migrations
│   │   │   └── seed.ts           -- seed data
│   │   ├── middleware/
│   │   │   ├── auth.ts           -- JWT auth middleware
│   │   │   └── errorHandler.ts   -- global error handler
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── suggestions.ts
│   │   │   ├── operators.ts
│   │   │   ├── auditLog.ts
│   │   │   ├── dashboard.ts
│   │   │   └── webhooks.ts
│   │   ├── agents/
│   │   │   ├── scheduleWatcher.ts
│   │   │   ├── waitlistAgent.ts
│   │   │   ├── rescheduleAgent.ts
│   │   │   ├── discoveryFlightAgent.ts
│   │   │   ├── nextLessonAgent.ts
│   │   │   └── scoringEngine.ts
│   │   ├── services/
│   │   │   ├── suggestionService.ts
│   │   │   ├── auditService.ts
│   │   │   ├── operatorService.ts
│   │   │   └── fspClient.ts      -- simulated FSP API client
│   │   └── types/
│   │       └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── api/
│   │   ├── components/
│   │   │   ├── ApprovalQueue.tsx
│   │   │   ├── ActivityFeed.tsx
│   │   │   ├── PolicyConfig.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Login.tsx
│   │   │   └── Layout.tsx
│   │   ├── hooks/
│   │   └── types/
│   ├── package.json
│   └── tsconfig.json
├── Makefile
├── .env.example
└── docker-compose.yml
```

## Deviations from Brief

1. **Single process instead of separate services**: The agent-service and notification-service are integrated into the API service as modules rather than separate microservices. This simplifies deployment for a demo while maintaining the same logical separation. The modular architecture allows easy extraction to separate services later.

2. **No Twilio/Email integration**: Notification adapters are stubbed as the brief focuses on the scheduling/approval flow. The notification interfaces are defined for future implementation.

3. **Simulated FSP API**: Since we don't have actual FSP API access, the fspClient module simulates FSP responses with realistic data structures matching their documented API.
