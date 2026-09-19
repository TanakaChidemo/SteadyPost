# SteadyPost

A content publishing tool for Instagram and Facebook: log in, write a post
(optionally with AI help), attach a photo or video, and publish it.

There is **no database** — every user, social account, and draft is
hardcoded in-memory in [`backend/src/data/store.js`](backend/src/data/store.js)
and resets whenever the backend restarts. The app is built to demonstrate
the workflow clearly rather than to persist data.

See also: [`docs/RUNNING.md`](docs/RUNNING.md) for a step-by-step setup guide
(including common gotchas), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for how the pieces fit together, and [`docs/openapi.yaml`](docs/openapi.yaml)
for the API contract (served at `/api/docs` when the backend is running).

## Features

- **Login** — email/password auth with bcrypt-hashed passwords and JWTs, or
  a one-click demo login.
- **Connected accounts** — an Instagram and a Facebook account are linked by
  default; more can be "connected" from the Social Accounts page.
- **Content Studio** — write a post, attach up to 4 photos/videos, preview
  it as it would appear in each platform's feed, and publish to one or more
  platforms at once.
- **AI Assist** — generate captions, suggest hashtags, or repurpose a post
  for the other platform, powered by Groq (falls back to a built-in
  template generator if no AI key is configured).
- **Publishing** — hits the real Facebook/Instagram Graph API when a Meta
  app is configured; otherwise simulates a successful publish so the full
  flow works out of the box.

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router), JavaScript (JSX), Tailwind | Content Studio, Social Accounts pages |
| Core backend | Node.js + Express | Auth (JWT), content, AI proxy, publish |
| AI microservice | Python + Flask | Calls Groq (OpenAI-compatible API) for real caption/hashtag generation |
| Data | In-memory only — `backend/src/data/store.js` | No database. Resets on restart. |
| Async publish jobs | In-memory scheduler (`backend/src/queue/`) | No external queue. |

## Repository layout

```
frontend/       Next.js dashboard (Content Studio, Social Accounts)
backend/        Express API gateway (auth, content, AI proxy, publish)
  src/data/     store.js — all hardcoded demo data (users, accounts, drafts)
  src/queue/    In-memory job scheduler + publish job processor
  src/services/publishers/   Meta (Facebook/Instagram) publish integration
                (falls back to a sandbox simulator unless META_APP_ID is set)
ai-service/     Flask microservice for AI content generation (Groq)
docs/           Architecture, OpenAPI spec
.github/workflows/  CI pipeline
```

## Prerequisites

- Docker + Docker Compose, **or** Node.js 20+ and Python 3.12+ to run each
  service directly (see below)
- A free [Groq API key](https://console.groq.com/keys) if you want real
  AI-generated captions instead of the built-in template fallback

## First-time setup

1. Copy environment files:
   ```bash
   cp backend/.env.example backend/.env
   cp ai-service/.env.example ai-service/.env
   cp frontend/.env.local.example frontend/.env.local
   ```
2. Paste your Groq key into `ai-service/.env` (`GROQ_API_KEY=gsk_...`). This
   is the only secret you need — everything else has a working default.
3. Start everything:
   ```bash
   docker compose up --build
   ```
4. Open:
   - Frontend: http://localhost:3000
   - Backend health: http://localhost:4000/health
   - API docs (Swagger UI): http://localhost:4000/api/docs
   - AI service health: http://localhost:5001/health

The dashboard auto-logs you in with a demo account on first load, and two
demo social accounts (Instagram + Facebook) are already "connected" — there's
nothing else to configure to try the full flow.

## Running services individually (without Docker)

```bash
# Backend
cd backend && npm install && npm run dev

# AI service
cd ai-service && pip install -r requirements.txt && flask --app app.main run --port 5001 --debug

# Frontend
cd frontend && npm install && npm run dev
```
No database setup needed — the backend has no external dependencies besides
the AI service (and even that is optional; without it, caption/hashtag
generation falls back to a built-in template).

## Testing & linting

```bash
cd backend && npm run lint && npm test
cd frontend && npm run lint && npm run build
cd ai-service && pip install flake8 pytest && flake8 app && pytest
```
CI (`.github/workflows/ci.yml`) runs all three on every push/PR to `main`
and `develop`, then builds production Docker images on `main`.

## Current implementation status

- Login/auth is real (bcrypt password hashing + JWT), backed by a
  hardcoded user list instead of a database.
- Social accounts (Instagram + Facebook) are hardcoded demo entries;
  "connecting" a new one appends to an in-memory list rather than going
  through real OAuth.
- Facebook/Instagram publishing hits the real Graph API only if
  `META_APP_ID` is configured; otherwise it simulates success and returns a
  fake external post ID.
- AI caption/hashtag generation calls Groq for real when `GROQ_API_KEY` is
  set in `ai-service/.env`; otherwise it falls back to a built-in template
  so the app still works offline.
- Uploaded media (image/video) is converted to a data URL and held in
  memory — there's no object storage.
- Only Instagram and Facebook are supported as publish destinations.
- Automated test coverage beyond CI scaffolding is minimal.
