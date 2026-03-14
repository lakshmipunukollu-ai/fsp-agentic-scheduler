# Story 2: Suggestions CRUD and Approval Queue

## Description
Implement the core suggestion management system. Dispatchers can view, approve, decline, and bulk-manage scheduling suggestions. Every state change is audited.

## Acceptance Criteria
- List suggestions with filtering by status, type, and pagination
- Approve/decline individual suggestions
- Bulk approve/decline
- Audit log entry created on every state change
- Suggestions scoped to operator_id

## API Endpoints
- GET /api/suggestions
- GET /api/suggestions/:id
- POST /api/suggestions/:id/approve
- POST /api/suggestions/:id/decline
- POST /api/suggestions/bulk-approve
- POST /api/suggestions/bulk-decline

## Tasks
- [ ] Create suggestions table with indexes
- [ ] Create audit_log table (INSERT-ONLY)
- [ ] Implement suggestion service
- [ ] Implement audit service
- [ ] Build suggestion routes with validation
- [ ] Add bulk operations
