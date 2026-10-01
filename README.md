# SteadyPost

A content publishing tool for Instagram and Facebook: log in, write a post
(optionally with AI help), attach a photo or video, and publish it.

Users, social accounts, drafts, and publish status live in **MongoDB**.
The backend will not start without `MONGODB_URI` (MongoDB Atlas or a local
instance). A demo user, two sandbox social accounts, and a sample draft are
seeded once at boot in
[`backend/src/data/seed.js`](backend/src/data/seed.js) if they do not
already exist.

See also: [`docs/RUNNING.md`](docs/RUNNING.md) for a step-by-step setup guide
(including common gotchas), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for how the pieces fit together, and [`docs/openapi.yaml`](docs/openapi.yaml)
for the API contract (served at `/api/docs` when the backend is running).

## Features

- **Login** — email/password (bcrypt + JWTs), optional Google OAuth, or the
  seeded demo account (`demo@example.com` / `password123`). The app does
  **not** auto-log you in; a stored JWT is restored on reload.
- **Connected accounts** — seed attaches two sandbox Instagram/Facebook
  rows (no Page token). Real connect uses Facebook Login for Business in
  the browser, then the Graph API, when Meta env vars are set.
- **Content Studio** — write a post, attach up to 4 photos/videos, preview
  it as it would appear in each platform's feed, and publish to one or more
  platforms at once.
- **AI Assist** — generate captions, suggest hashtags, or repurpose a post
  for the other platform, powered by Groq (falls back to a built-in
  template generator if no AI key is configured).
- **Publishing** — hits the real Facebook/Instagram Graph API when
  `META_APP_ID` is set and a live `socialAccountId` is sent; otherwise
  simulates a successful publish so the full flow works out of the box.

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router), JavaScript (JSX), Tailwind | Content Studio, Social Accounts pages |
| Core backend | Node.js + Express | Auth (JWT), content, AI proxy, publish |
| AI microservice | Python + Flask | Groq first, optional OpenAI; template fallback if neither key is set |
| Data | MongoDB (`MONGODB_URI`) | Mongoose models in `backend/src/models/` |
| Async publish jobs | In-process scheduler (`backend/src/queue/`) | No Redis/Bull. In-flight jobs die on restart; MongoDB rows survive. |

## Repository layout

```
frontend/       Next.js dashboard (Content Studio, Social Accounts)
backend/        Express API gateway (auth, content, AI proxy, publish)
  src/models/   MongoDB models (users, social accounts, drafts, posts)
  src/data/     seed.js — demo user, sandbox accounts, sample draft
  src/queue/    In-process job scheduler + publish job processor
  src/services/publishers/   Meta (Facebook/Instagram) publish integration
                (sandbox simulator unless META_APP_ID and socialAccountId)
ai-service/     Flask microservice for AI content generation (Groq / OpenAI)
docs/           Architecture, OpenAPI spec
.github/workflows/  CI pipeline
```

## Prerequisites

- Docker + Docker Compose, **or** Node.js 20+ and Python 3.12+ to run each
  service directly (see below)
- A MongoDB connection string (`MONGODB_URI`) — Atlas or local
- A free [Groq API key](https://console.groq.com/keys) if you want real
  AI-generated captions instead of the built-in template fallback

## First-time setup

1. Clone the repo:
   ```bash
   git clone https://github.com/TanakaChidemo/SteadyPost.git
   cd SteadyPost
   ```
2. Copy environment files:
   ```bash
   cp backend/.env.example backend/.env
   cp ai-service/.env.example ai-service/.env
   cp frontend/.env.local.example frontend/.env.local
   ```
3. Put a real MongoDB URI in `backend/.env` (`MONGODB_URI=...`). Copying
   the example is not enough — the backend exits if this is unset. Groq
   (`GROQ_API_KEY` in `ai-service/.env`) is optional.
4. Start everything:
   ```bash
   docker compose up --build
   ```
5. Open:
   - Frontend: http://localhost:3000
   - Backend health: http://localhost:4000/health
   - API docs (Swagger UI): http://localhost:4000/api/docs
   - AI service health: http://localhost:5001/health

Sign in with the seeded demo account (`demo@example.com` / `password123`)
or register. That user already has two sandbox social accounts and a
sample draft. Google login and live Meta connect need extra env vars —
see [`docs/RUNNING.md`](docs/RUNNING.md).

## Running services individually (without Docker)

```bash
# Backend (requires MONGODB_URI in backend/.env)
cd backend && npm install && npm run dev

# AI service
cd ai-service && pip install -r requirements.txt && flask --app app.main run --port 5001 --debug

# Frontend
cd frontend && npm install && npm run dev
```
The AI service is optional; without it, caption/hashtag generation falls
back to a built-in template on the backend.

## Testing & linting

```bash
cd backend && npm run lint && npm test
cd frontend && npm run lint && npm run build
cd ai-service && pip install flake8 pytest && flake8 app && pytest
```
CI (`.github/workflows/ci.yml`) runs all three on every push/PR to `main`
and `develop`, then builds production Docker images on `main`.

## Current implementation status

- Login is real (bcrypt + JWT) in MongoDB. Optional Google OAuth when
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set.
- Seeded social accounts are sandbox (no Page token). Connecting via
  Facebook Login for Business + Graph is implemented when Meta env vars
  are set; otherwise the UI can still attach a sandbox account by name.
- Facebook/Instagram publishing hits the real Graph API only if
  `META_APP_ID` is set *and* a `socialAccountId` is sent; otherwise it
  simulates success and returns a fake external post ID.
- AI caption/hashtag generation calls Groq for real when `GROQ_API_KEY` is
  set in `ai-service/.env` (optional `OPENAI_API_KEY` fallback); otherwise
  it uses a built-in template.
- Uploaded media (image/video) is converted to a data URL and held in
  memory — there's no object storage.
- Only Instagram and Facebook are supported as publish destinations.
- Automated tests are thin (backend health check plus CI lint/build).
