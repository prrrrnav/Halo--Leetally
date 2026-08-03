# LeetAlly SDE-1 product specification

## Product promise

LeetAlly conducts a realistic coding interview inside LeetCode, observes the
candidate's explanation and implementation, and returns an evidence-backed
assessment against an SDE-1 hiring bar.

## Core interview contract

- 35-45 minute coding interview with a five-minute warning.
- Candidate clarifies requirements before choosing an approach.
- Interviewer never reveals or writes the complete solution.
- Interviewer retains prior conversation and asks one focused follow-up.
- Code, language, visible output, transcript, duration, and hints are evidence.
- Completion returns scores for communication, problem solving,
  implementation, complexity, and testing.
- Every score cites evidence and maps to a concrete next drill.

## Release gates

### Interview quality

- [x] Voice-led interview on a live LeetCode problem.
- [x] Conversation memory across turns.
- [x] Code and output synced during and at the end of a session.
- [x] Server-owned SDE-1 scorecard.
- [x] Hiring signal and targeted next drills.
- [x] Explicit phases: clarify, approach, implement, test, complexity, wrap-up.
- [ ] Track hints, interruptions, code revisions, test attempts, and timestamps.
- [x] Automatic five-minute warning and deterministic 45-minute completion.

### Trust and calibration

- [ ] Replace heuristic scoring with a versioned rubric assessor returning
  strict structured output while retaining deterministic fallbacks.
- [ ] Build a 100-session anonymized calibration set graded by experienced
  interviewers.
- [ ] Require at least 80% agreement on hire/not-yet and no dimension mean
  absolute error above 1.5 points before marketing the score as calibrated.
- [x] Show the evidence behind every score.
- [ ] Allow transcript corrections before final assessment.
- [ ] Never infer correctness from code length or claim acceptance without
  confirmed output.

### Persistence and safety

- [ ] Replace the in-memory interview repository with Supabase persistence.
- [ ] Persist turns, code snapshots, assessment version, and feedback.
- [ ] Enforce ownership with RLS and test cross-user access.
- [ ] Add deletion/export controls and retention limits for voice/transcripts.
- [ ] Add rate limits, request-size limits, structured logs, and redaction.
- [ ] Publish privacy policy, terms, AI disclosure, and support contact.

### Paid product

- [ ] Free user receives one complete scored interview without a card.
- [ ] Enforce interview-minute entitlement server-side, not only in the UI.
- [x] Gate paid providers behind local and server-side speech detection.
- [x] Charge accumulated recognized speech seconds; never wall-clock silence.
- [x] Deduplicate retried speech uploads before incrementing usage.
- [ ] Warn before paid minutes are consumed and handle interrupted sessions.
- [ ] Offer an interview sprint with a target company and interview date.
- [ ] Generate a weekly weakness trend and adaptive practice queue.

### Launch metrics

- Interview start to completion rate: at least 70%.
- Scorecard viewed after completion: at least 90%.
- Next drill started within 48 hours: at least 35%.
- Second interview within seven days: at least 30%.
- Paid conversion among users with an interview in 30 days: at least 8%.
- Refund or score-dispute rate: below 5%.

## Recommended initial offer

- Free: one complete interview and scorecard.
- SDE-1 Sprint: 12 interviews over 30 days for INR 799.
- SDE-1 Intensive: 25 interviews over 30 days for INR 1,199.

Do not sell unlimited usage until model, speech, and transcription unit costs
have been measured from real sessions.
