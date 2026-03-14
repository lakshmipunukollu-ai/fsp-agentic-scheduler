# Story 1: Authentication and Multi-Tenancy

## Description
Implement JWT-based authentication and multi-tenant data isolation. Every database query must include operator_id to prevent data leakage between tenants.

## Acceptance Criteria
- Users can register and login with email/password
- JWT tokens issued with 24-hour expiration
- Role-based access control: admin, scheduler, viewer
- operator_id enforced on all DB queries
- Passwords hashed with bcrypt

## API Endpoints
- POST /api/auth/login
- POST /api/auth/register
- GET /health

## Tasks
- [ ] Set up Express server with TypeScript
- [ ] Create database tables: operators, users
- [ ] Implement JWT auth middleware
- [ ] Implement login/register routes
- [ ] Add role-based guards
- [ ] Health check endpoint
