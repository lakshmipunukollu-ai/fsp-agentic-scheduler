# Story 5: Dashboard Statistics and Audit Log

## Description
Provide dashboard statistics for dispatchers and a searchable, immutable audit log of all system actions.

## Acceptance Criteria
- Dashboard shows: pending count, approved/declined today, avg response time, suggestions by type
- Audit log is searchable by suggestion_id
- Audit log is paginated
- Audit log is immutable (INSERT-ONLY)

## API Endpoints
- GET /api/dashboard/stats
- GET /api/audit-log

## Tasks
- [ ] Implement dashboard stats queries
- [ ] Build audit log route with filtering
- [ ] Add pagination
