# CareerPilot AI MVP

Practical MERN-ready demo preserving the original `index.html` concept and visual language. The React/Vite client uses synthetic jobs; the Express API is MongoDB-ready (models can be wired to the `MONGODB_URI` adapter) and intentionally has no scraping or external LLM calls.

## Run on Windows

```powershell
npm install
npm run install:all
Copy-Item server\.env.example server\.env
npm run dev
```

Open http://localhost:5173. Build the client with `npm run build`; run only the API with `npm start --prefix server`.

The API includes demo auth (`POST /api/auth/demo`), jobs, saved jobs, applications/statuses, health, and deletion placeholder routes. Production work should add Mongoose schemas for User, Job (including trust metadata), Application, CandidateProfile, ResumeAnalysis (evidence states), Insight, and an authenticated retention/export service before connecting MongoDB. Data shown is not verified employer data.
