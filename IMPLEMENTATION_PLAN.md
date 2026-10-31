# CareerPilot AI Candidate Workflow Implementation Plan

## Current baseline

- Job discovery and provider synchronization are already MongoDB-backed.
- Candidate profile, saved jobs, applications, and demo workflow state are currently in memory.
- The frontend currently starts a demo JWT session and sends bearer tokens.
- The implementation will preserve existing job discovery, matching, TrustLens, TimeBudget, AI Studio, and Rejection Coach behavior.

## Phases

1. **Persistence and authentication**
   - Add `User`, `CandidateProfile`, `SavedJob`, `Application`, `ApplicationEvent`, `Resume`, and `ExtensionConnection` models.
   - Add centralized auth helpers with bcrypt password hashing, short-lived JWTs, secure cookies, bearer compatibility, logout, current-user, registration, and login.
   - Add ownership-safe indexes and validation.
2. **Candidate profile and application persistence**
   - Move profile, saved jobs, and application routes from memory to MongoDB.
   - Preserve existing response shapes where possible.
   - Add official-URL validation and explicit `APPLICATION_STARTED`/candidate-confirmed submission events.
3. **Resume and evidence**
   - Add private local-storage abstraction, PDF/DOCX validation, metadata, extraction, versioning, deletion, and reviewable evidence.
   - Feed only verified profile and resume evidence into AI-generated application answers.
4. **Frontend onboarding**
   - Add registration, login, logout, current-user restoration, multi-step onboarding, resume management, and application preparation screens.
5. **Chrome extension**
   - Add a Manifest V3 extension with scoped pairing, portal detection, one initial adapter, field mapping, reviewable autofill, and explicit tracking confirmation.
   - Do not automate submission, CAPTCHA, OTP, employer credentials, or unsupported portals.
6. **Validation and documentation**
   - Add unit and API tests for auth, ownership, resume validation, extension pairing, application lifecycle, and unsupported portals.
   - Update setup instructions, environment variables, supported portal limitations, and remaining constraints.

## Completed implementation batches

- **Batch 1:** Persistent authentication foundation and shared data models. Existing demo authentication remains available for backward compatibility.
- **Batch 2:** Registered users now use MongoDB-backed candidate profiles, saved jobs, planner settings, application records, application events, privacy export, and account deletion. The legacy demo session remains memory-backed until frontend onboarding is migrated.
