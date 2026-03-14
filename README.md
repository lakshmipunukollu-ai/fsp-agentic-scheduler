# FSP Agentic Scheduler

A multi-tenant scheduling assistant for flight training operations. Monitors Flight Schedule Pro (FSP) for scheduling opportunities and generates explainable, auditable suggestions for dispatchers to approve or decline.

## Stack

- **Backend:** TypeScript + Node.js + Express
- **Frontend:** React + TypeScript + Vite
- **Database:** PostgreSQL (multi-tenant, operator_id on every table)
- **Auth:** JWT (HS256, 24-hour expiration)

## Quick Start

```bash
# Install dependencies
make install

# Set up database
make migrate
make seed

# Run backend (port 3001)
make dev

# In another terminal, run frontend (port 5001)
cd frontend && npm run dev
```

## Demo Credentials

- **Admin:** admin@skyhigh.com / admin123
- **Scheduler:** dispatcher@skyhigh.com / scheduler123

## Available Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start backend dev server on port 3001 |
| `make build` | Build backend and frontend for production |
| `make test` | Run test suite (54 tests) |
| `make seed` | Run migrations and seed demo data |
| `make migrate` | Run database migrations |
| `make install` | Install all dependencies |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/api/auth/login` | No | Login |
| POST | `/api/auth/register` | No | Register |
| GET | `/api/suggestions` | Yes | List suggestions (filterable) |
| GET | `/api/suggestions/:id` | Yes | Get single suggestion |
| POST | `/api/suggestions/:id/approve` | Admin/Scheduler | Approve suggestion |
| POST | `/api/suggestions/:id/decline` | Admin/Scheduler | Decline suggestion |
| POST | `/api/suggestions/bulk-approve` | Admin/Scheduler | Bulk approve |
| POST | `/api/suggestions/bulk-decline` | Admin/Scheduler | Bulk decline |
| GET | `/api/dashboard/stats` | Yes | Dashboard statistics |
| GET | `/api/audit-log` | Yes | Audit log entries |
| GET | `/api/operators/:id/config` | Yes | Get operator config |
| PUT | `/api/operators/:id/config` | Admin | Update operator config |
| GET | `/api/operators/:id/feature-flags` | Yes | Get feature flags |
| PUT | `/api/operators/:id/feature-flags` | Admin | Update feature flags |
| POST | `/api/webhooks/fsp` | No | Receive FSP webhook events |

## Architecture

The system consists of an Express API with integrated agent modules:

- **WaitlistAgent** - fills cancellations by scoring waitlisted students
- **RescheduleAgent** - suggests alternative times for cancelled lessons
- **DiscoveryFlightAgent** - books discovery flights for prospects
- **NextLessonAgent** - schedules next lesson after completion
- **ScoringEngine** - configurable weighted scoring for candidate ranking
- **ScheduleWatcher** - polls for and dispatches schedule events

Every suggestion includes a full rationale object with candidate scores, constraints evaluated, and confidence level.

## Environment Variables

Copy `.env.example` to `.env` and configure:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/fsp_scheduler
JWT_SECRET=your-secret
PORT=3001
```
