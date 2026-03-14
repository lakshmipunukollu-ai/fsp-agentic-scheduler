# Story 4: Operator Configuration and Feature Flags

## Description
Operators (tenants) can configure their scheduling policy weights, search windows, and feature flags. This enables per-tenant rollout of new agent behaviors.

## Acceptance Criteria
- Get/update operator config (priority weights, search windows)
- Get/update feature flags per operator
- Config changes audited
- Default config values when not set

## API Endpoints
- GET /api/operators/:id/config
- PUT /api/operators/:id/config
- GET /api/operators/:id/feature-flags
- PUT /api/operators/:id/feature-flags

## Tasks
- [ ] Implement operator service
- [ ] Build config routes
- [ ] Add validation for config values
- [ ] Audit config changes
