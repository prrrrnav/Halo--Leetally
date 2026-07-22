# AI LeetCode Interviewer — one-week MVP starter

A runnable modular-monolith starter for a Manifest V3 Chrome extension backed by FastAPI. Local development uses mock auth, an in-memory interview repository, and a mock AI interviewer. Supabase Auth/Postgres boundaries and SQL/RLS are included so providers can be swapped without changing routes or application services.

## What works now

- `GET /api/v1/health`
- `GET /api/v1/auth/me` with local mock bearer tokens or Supabase JWTs
- `POST /api/v1/interviews` and `GET /api/v1/interviews/{id}`
- Mock AI reply endpoint: `POST /api/v1/interviews/{id}/messages`
- MV3 extension with a floating LeetCode widget and starter DOM extraction
- Supabase schema, indexes, profile trigger, and row-level-security policies
- Backend tests and extension utility tests

## Architecture

Routes → application services → domain ports → adapters. Current adapters are mock auth, Supabase JWT auth, in-memory repository, mock AI, browser speech, and a no-op payment placeholder. Replace an adapter in the composition root (`backend/app/dependencies.py`) without changing routes.

## Run the backend

Requires Python 3.11+.

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item ..\.env.example .env
uvicorn app.main:app --reload
```

Open `http://localhost:8000/docs`. In local mock mode, send `Authorization: Bearer dev-user` to protected endpoints.

Run tests:

```powershell
cd backend
pytest
```

## Run the extension

Requires Node.js 20+.

```powershell
cd extension
npm install
npm run build
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist`. Open a LeetCode problem page; the floating **AI Interview** button appears at bottom-right.

For local development the extension uses the mock token `dev-user`. Before production, replace this in `src/services/auth-client.ts` with a Supabase browser client session and configure the extension ID in backend CORS.

## Connect Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/0001_initial.sql` in the SQL editor.
3. Set `AUTH_MODE=supabase` and provide `SUPABASE_URL` plus `SUPABASE_JWT_SECRET` in `backend/.env`.
4. Implement `SupabaseInterviewRepository` behind the existing `InterviewRepository` port (Day 3 checklist item). The migration is ready for it.

Never put the JWT secret, service-role key, or an AI API key in the extension.

## API example

```powershell
$headers = @{ Authorization = "Bearer dev-user" }
Invoke-RestMethod http://localhost:8000/api/v1/auth/me -Headers $headers
Invoke-RestMethod http://localhost:8000/api/v1/interviews -Method Post -Headers $headers -ContentType application/json -Body '{"platform":"leetcode","problem_slug":"two-sum","problem_title":"Two Sum","difficulty":"easy"}'
```

## One-week checklist

See [`docs/7_DAY_CHECKLIST.md`](docs/7_DAY_CHECKLIST.md). Keep paid AI, subscriptions, analytics dashboards, and realtime audio out of this first release.

