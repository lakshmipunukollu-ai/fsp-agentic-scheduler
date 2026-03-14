# Story 6: Frontend UI

## Description
Build the React + TypeScript frontend with ApprovalQueue, ActivityFeed, PolicyConfig, and Dashboard components. The UI should feel like a premium dispatcher tool.

## Acceptance Criteria
- Login page with JWT auth
- Approval Queue: view pending suggestions, approve/decline individually or in bulk
- Each suggestion shows full rationale (trigger, scores, constraints, confidence)
- Activity Feed: real-time immutable audit log
- Policy Config: update operator weights and feature flags
- Dashboard: key metrics at a glance
- Responsive design
- Connected to backend API

## Components
- Login
- Layout with navigation
- ApprovalQueue (main view)
- SuggestionCard with rationale display
- ActivityFeed
- PolicyConfig
- Dashboard

## Tasks
- [ ] Set up React + Vite + TypeScript
- [ ] Build API client with auth interceptor
- [ ] Implement Login page
- [ ] Build Layout with sidebar navigation
- [ ] Build ApprovalQueue with filtering
- [ ] Build SuggestionCard with rationale visualization
- [ ] Build ActivityFeed
- [ ] Build PolicyConfig
- [ ] Build Dashboard with stats
