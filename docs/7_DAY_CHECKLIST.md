# Seven-day MVP implementation checklist

## Day 1 — Foundation
- [x] FastAPI composition root, configuration, health route
- [x] Domain ports and mock adapters
- [x] Extension MV3 build and floating widget
- [ ] Create Supabase project and copy local environment values

## Day 2 — Authentication
- [x] Mock and Supabase JWT verification adapters
- [x] Protected `/auth/me` route
- [x] Add Supabase client login UI to extension
- [ ] Test signup, login, logout, expired token, and refresh

## Day 3 — Persistence
- [x] Schema and RLS migration
- [x] Repository port and in-memory adapter
- [ ] Implement Supabase/Postgres repository adapter
- [ ] Confirm cross-user reads fail under RLS

## Day 4 — LeetCode integration
- [x] Platform port and starter LeetCode extractor
- [x] Floating widget and API client
- [ ] Validate selectors on easy/medium/hard and old/new layouts
- [x] Add graceful unsupported-page state

## Day 5 — Interview loop
- [x] Mock interviewer provider and message endpoint
- [x] Add interview state (clarification, approach, coding, testing, complexity, wrap-up)
- [ ] Persist messages and timestamps
- [x] Add End Interview and deterministic evidence-backed feedback

## Day 6 — Voice and hardening
- [x] Browser speech adapter boundary
- [x] Wire speech recognition/synthesis behind local VAD and explicit interview controls
- [ ] Add rate limits, request size limits, structured logs, and error states
- [ ] Test permissions, offline mode, cold starts, and invalid DOM data

## Day 7 — Release candidate
- [ ] Run automated tests and a manual end-to-end pass
- [ ] Add privacy policy and concise data disclosure
- [ ] Deploy backend, configure CORS, and load production extension build
- [ ] Recruit 10 testers; record completion rate, duration, errors, and feedback

Release gate: a new tester can install, authenticate, start an interview on LeetCode, exchange messages, finish, and see feedback without developer help.
