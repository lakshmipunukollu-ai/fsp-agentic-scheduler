# Story 3: Agent Engine and Scheduling Agents

## Description
Build the core agent engine including ScheduleWatcher, WaitlistAgent, RescheduleAgent, DiscoveryFlightAgent, and NextLessonAgent. Agents generate explainable suggestions with full rationale objects.

## Acceptance Criteria
- ScheduleWatcher monitors for schedule events
- WaitlistAgent fills cancellation openings with scored candidates
- RescheduleAgent finds alternative slots for cancelled students
- DiscoveryFlightAgent books discovery flights quickly
- NextLessonAgent schedules follow-up lessons
- Every suggestion includes a complete rationale object
- Scoring engine uses operator-configured weights
- Feature flags control which agents are active per tenant

## Tasks
- [ ] Implement scoring engine with configurable weights
- [ ] Build WaitlistAgent with candidate scoring
- [ ] Build RescheduleAgent
- [ ] Build DiscoveryFlightAgent
- [ ] Build NextLessonAgent
- [ ] Implement ScheduleWatcher polling loop
- [ ] Create simulated FSP client for demo data
- [ ] Add feature flag checks
