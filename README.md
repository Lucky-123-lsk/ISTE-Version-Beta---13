# CareerPilot AI

CareerPilot AI is a candidate-controlled job-search and application decision workspace. Its demo experience focuses on explainable recommendations, visible listing uncertainty, resume evidence, honest outcome reporting, and privacy controls.

## Run locally on Windows

From the repository root in PowerShell:

```powershell
npm install
npm run install:all
Copy-Item server\.env.example server\.env
npm run dev
```

Open `http://localhost:5173`. The Vite client proxies `/api` requests to the Express API on port `4000`.

Build the client:

```powershell
npm run build
```

Run only the API:

```powershell
npm start --prefix server
```

## Product workflow

1. **Career DNA** - Maintain skills with verified, self-declared, or learning labels; edit interests, learning goals, and role preferences. Recommendations are grouped as bridge, growth, and stretch paths.
2. **Discover Jobs** - Search persisted listings from configured job providers; filter title/skills, location, country, workplace, employment type, experience, and posting date. India is prioritized but is not a required location.
3. **TrustLens** - Review provider source records, original links, verification timestamps, and conservative listing status. A provider observation is not a guarantee of employer legitimacy or continued availability.
4. **TimeBudget Planner** - Set a weekly time budget and maximum effort, then review the deterministic, explainable priority factors. Scores are illustrative assumptions, not validated predictions.
5. **ProofPath Studio** - Inspect sample evidence references, write candidate-controlled draft wording, confirm its accuracy, and approve a draft for review. Approval does not submit an application.
6. **AI Studio** - Configure Gemini, Groq, or Ollama on the server and run consent-gated resume-to-job analysis. The server validates exact evidence quotes against submitted resume text; unsupported suggestions are not displayed as supported claims.
7. **Applications and RealityCheck** - Track status history and see observed counts, data sufficiency, and conclusions the current sample cannot support.
8. **PrivacyVault** - Review data purpose and retention behavior, export the in-memory demo data, or delete the demo account data.

## API areas

- `POST /api/auth/demo` - Issue a short-lived JWT for the demo candidate.
- `GET /api/jobs` - MongoDB-backed search, filters, India-prioritized newest sorting, and pagination.
- `/api/saved`, `/api/saved/jobs` - Saved listing actions and saved listing records.
- `GET /api/jobs/sync-status` - Configured provider and latest run status without exposing credentials.
- `POST /api/admin/jobs/sync` - Token-protected manual, optionally source-specific synchronization.
- `/api/profile`, `/api/planner` - Candidate profile and application budget.
- `/api/trust/:jobId` - Trust signals, similar demo listings, review, and report actions.
- `/api/resume/evidence`, `/api/resume/drafts` - Sample evidence and candidate-authored drafts.
- `/api/ai/status`, `POST /api/ai/resume-analysis` - Provider configuration status and consent-gated, evidence-validated analysis.
- `/api/applications`, `/api/insights` - Application status history and conservative outcome summaries.
- `/api/privacy` - Data practice summary, export, and account deletion.

## Current implementation limits

- Job records and provider sync logs are persisted in MongoDB. Candidate profile, saved-job selections, application records, and other demo workflows remain in memory and reset on API restart.
- The ingestion system does not scrape websites. Its adapters use TheirStack's documented Search Jobs API and the public Greenhouse, Lever, and Ashby job-board APIs. Public ATS ingestion requires the specific company board identifiers in `JOB_COMPANIES_JSON`.
- Absence from a fetch does not close or expire a role. Provider fetch failures are logged separately; active observations become `unknown` after the configured verification freshness window.
- Cross-source merging is conservative: canonical application URLs are preferred; otherwise a strict match requires company domain, normalized title and location, exact normalized-description hash, and a different provider. Same-title records alone are never merged.
- Resume evidence is illustrative. File uploads and resume parsing are not enabled; provider-backed analysis is disabled by default.
- AI integration supports server-side Gemini, Groq, or Ollama adapters. No provider is called until configured in `server/.env` and the candidate consents.
- Real account registration, production-grade authentication, consent records, secure file storage, and enforceable long-term retention policies still need implementation.
- There is no job application submission feature. Candidate approval only marks a draft as reviewed.

## Configure an AI provider later

The browser never receives an AI key. Configure the provider in `server/.env`, then restart the API:

```dotenv
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
AI_API_KEY=
```

For Groq, set `AI_PROVIDER=groq` and `AI_API_KEY` to the Groq key.

For local Ollama, set `AI_PROVIDER=ollama`, optionally set `AI_MODEL`, and use `OLLAMA_BASE_URL=http://localhost:11434`. Pull the selected model in Ollama before running analysis. Local Ollama normally does not require an API key.

For an Ollama Cloud or another protected Ollama-compatible endpoint, set `OLLAMA_BASE_URL` to that provider's API base URL and put its key in `OLLAMA_API_KEY`. The adapter sends it as a server-side Bearer token. Never add this value to the client or commit a filled-in `.env` file.

Provider model names and quotas can change; choose a model enabled for your account.

AI Studio displays configuration status without exposing secrets. Before analysis, the candidate must explicitly consent to sending text to the configured provider. The API does not save submitted resume text. Hosted providers may have their own processing and retention terms, so review those terms before sending personal data. For local Ollama, requests are sent to the configured local endpoint.

Only exact, sufficiently long quotes found in the candidate-provided resume text can receive the `supported-by-exact-quote` label. All other results are marked `insufficient-evidence`; this is a deterministic check, not a guarantee that the provider's interpretation is correct.

### Rejection Coach

Rejection Coach asks a few optional, skippable reflection questions and uses the configured AI provider to interpret supplied answers, feedback, and resume context, then suggest evidence-grounded next steps. Employer feedback and candidate answers are checked against exact quotes before their factors appear in the report. Both `/api/rejection/questions` and `/api/rejection/report` require authentication and explicit `consentAccepted: true`. Contact emails and phone numbers are masked before provider requests. Resume, feedback, and answers are not written to persistent storage; report results are cached in server memory for up to 20 minutes. Set optional `AI_LITE_MODEL` and `AI_STRONG_MODEL` to override the question/feedback extraction and report models; unset values fall back to `AI_MODEL` and the selected provider defaults. The selected application stage is context only, never proof of a rejection reason.

## Configure job ingestion

Set `MONGODB_URI` and the optional ingestion settings in `server/.env`. The `Job`, `JobSource`, and `JobSyncRun` Mongoose models create their indexes when the API connects. There was no prior MongoDB job schema or data migration to preserve.

TheirStack is the broad search source and requires a server-side `THEIRSTACK_API_KEY`. The adapter uses the documented `POST https://api.theirstack.com/v1/jobs/search` endpoint, Bearer authentication, `job_title_or` role searches, and `limit`/`offset` pagination over the response `data` and `metadata.total_results`. It honors transient `429`/`5xx` responses with bounded retries and `Retry-After` when supplied. Account quotas and limits vary; check the current TheirStack plan and API documentation.

TheirStack requires at least one posted-date filter; the adapter sends `posted_at_max_age_days` (default 90) and uses `discovered_at_gte` with an offset checkpoint for incremental synchronization and recovery after partial or failed runs. Each returned result consumes a credit, and TheirStack can check available credits against the requested page limit before returning results. Defaults cap a run at 50 results per page and two pages (`THEIRSTACK_PAGE_SIZE` and `THEIRSTACK_MAX_PAGES`), but even a small search can require enough balance for a full page. Lower these values to fit the available account balance. Sync records and the status endpoint expose result/credit estimates and pagination progress; a 402 response recommends reducing the page size. Keep the 90-day posted-date lookback in mind when configuring backfill.

### Adzuna

Create free API credentials at [developer.adzuna.com](https://developer.adzuna.com/) and set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in the server-only `.env`. Configure `ADZUNA_COUNTRIES` (default `in`), `ADZUNA_PAGE_SIZE` (default 20, maximum 50), `ADZUNA_MAX_PAGES` (default 2), and `ADZUNA_MAX_DAYS_OLD` (default 30). Adzuna has a free-tier call limit: every requested page is one API call, so the approximate maximum per run is search titles × countries × `ADZUNA_MAX_PAGES`. The Adzuna sync outcome reports the actual page-call count; retries can add additional API calls. Keep the page cap conservative and monitor your account quota. The Adzuna guide's sample URL uses HTTP; this adapter uses HTTPS with the same route and query parameters to protect credentials sent in the URL. Job descriptions are snippets from Adzuna, so extracted skills may be incomplete. Each listing links to its original Adzuna redirect/application URL for attribution and application.

Greenhouse, Lever, and Ashby are public per-company board APIs. Configure known board identifiers as a JSON array, for example:

```dotenv
JOB_COMPANIES_JSON=[{"name":"Company name","domain":"company.example","careerPage":"https://company.example/careers","atsProvider":"greenhouse","boardId":"board-token"}]
```

The ATS company registry accepts `atsProvider` values `greenhouse`, `lever`, or `ashby`, plus the company's `name`, provider `boardId`, and optional `careerPage` and `domain`. The example above is a template, not a live board. Do not add made-up board IDs. Greenhouse returns the public board listing in one supported request; Lever uses its documented `skip`/`limit` pagination; Ashby's public job-board endpoint returns the currently listed jobs and does not expose pagination in its published API.

The server performs an initial backfill after connecting to MongoDB, then syncs every `JOB_SYNC_INTERVAL_MINUTES` (default 360). Configuring a TheirStack or Adzuna key enables scheduled requests, which may consume account credits or API calls. It is a lightweight **single-process** scheduler; run one API instance unless an external distributed lock/queue is added. Repeated syncs update source and canonical records idempotently. Greenhouse and Ashby fetch current board listings; Lever paginates up to `JOB_SYNC_MAX_PAGES`, TheirStack uses its separate `THEIRSTACK_MAX_PAGES` cap, and Adzuna uses `ADZUNA_MAX_PAGES` for each title and country. Temporary failures are logged and do not mark unseen jobs expired.

Run one synchronization on demand:

```powershell
npm run sync:jobs --prefix server
```

Or set a strong `JOB_SYNC_TOKEN` and call `POST /api/admin/jobs/sync` with `Authorization: Bearer <token>`; an optional JSON body such as `{"providers":["greenhouse"]}` selects a source. Keep that token and the TheirStack key out of frontend code, browser storage, logs, and version control.

Optional settings include `JOB_SEARCH_TITLES` (pipe-separated role queries), `JOB_SEARCH_COUNTRIES` (empty means worldwide; use `IN` to explicitly limit TheirStack results to India), `THEIRSTACK_INITIAL_LOOKBACK_DAYS`, provider timeouts/page sizes, and `JOB_VERIFICATION_STALE_DAYS`. The discovery API accepts either country names or ISO country codes (for example `India` or `IN`). Results are sorted with India first, then by posting date; a country filter is never applied unless configured by the operator.

Provider documentation:

- [Adzuna Search API](https://developer.adzuna.com/docs/search) and [developer portal](https://developer.adzuna.com/).
- [TheirStack API reference](https://theirstack.com/en/docs/api-reference), [Search Jobs](https://theirstack.com/en/docs/api-reference/jobs/search_jobs_v1), [authentication](https://theirstack.com/en/docs/api-reference/authentication), [pagination](https://theirstack.com/en/docs/api-reference/pagination), and [rate limits](https://theirstack.com/en/docs/api-reference/rate-limit).
- [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html).
- [Lever Postings API](https://github.com/Lever/postings-api).
- [Ashby Public Job Posting API](https://developers.ashbyhq.com/docs/public-job-posting-api).

Run adapter and normalization tests with `npm test --prefix server`. Tests use mocked provider responses; they do not represent live fetched jobs.

The original `index.html` remains in the repository as an early standalone prototype reference.
