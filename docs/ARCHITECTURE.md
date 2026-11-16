# Architecture

## System overview

```
┌─────────────┐      ┌──────────────────┐      ┌────────────────────────┐
│  Next.js 14 │──────▶  Express API GW  │──────▶  LLM Adapter Interface │
│  (frontend) │◀──────│  (backend)       │◀──────│  (AiServiceLlmAdapter) │
└─────────────┘      └────────┬─────────┘      └───────────┬────────────┘
                               │                            ▼
                               │                   ┌────────────────┐
                               │                   │ Flask AI svc   │
                               │                   │ (Groq / OpenAI)│
                               ▼                   └────────────────┘
                     ┌──────────────────┐
                     │ MongoDB + BullMQ │
                     │ users, accounts, │
                     │ drafts, posts,   │
                     │ PostMetrics      │
                     └────────┬─────────┘
                              │
                              ▼
                     ┌───────────────────────────────┐
                     │ Platform Publishing Adapters  │
                     │ Meta (FB/IG), X, LinkedIn,    │
                     │ GBP Local Posts (#13),        │
                     │ or sandbox simulators         │
                     └───────────────────────────────┘
```

## OAuth login (app identity)

Google (or email/password) signs the user into SteadyPost. Meta is not
involved. The backend never sends Google's tokens to the browser — only
SteadyPost JWTs.

```mermaid
flowchart LR
  FE[Frontend]
  API[Backend]
  G[Google]
  DB[(MongoDB)]

  FE -->|sign in| API
  API -->|authorization code| G
  G -->|profile| API
  API -->|users + JWT| DB
```

The frontend starts `GET /api/v1/auth/oauth/google`. The backend redirects
to Google, exchanges the code on `GET /api/v1/auth/oauth/google/callback`,
creates or links the user, and redirects to `/auth/callback` with access
(15m) and refresh (7d) JWTs. Those tokens live in `localStorage`. Email
login is the same end state via `POST /api/v1/auth/login`.

## Meta Graph API (social-account connect)

This hop requires an existing JWT from login above. Facebook Login for
Business runs in the browser (`FB.login({ config_id })` in
[`frontend/lib/facebookSdk.js`](../frontend/lib/facebookSdk.js)); the backend
only talks to Graph and stores the Page token.

```mermaid
flowchart LR
  FE[Frontend]
  API[Backend]
  M[Meta Graph]
  DB[(MongoDB)]

  FE -->|FB.login + JWT| API
  API -->|list / connect Pages| M
  M -->|Page token| API
  API -->|socialaccounts| DB
```

`POST /api/v1/auth/oauth/meta/pages` lists Pages (`/me/accounts`,
`/me/businesses`, `/{business}/owned_pages`). `POST /api/v1/auth/oauth/meta/connect`
loads `/{pageId}` and stores the **Page access token** on `socialaccounts`.
A linked Instagram Business account is a second row with the same token.
The browser never sees that token (`isLive` is sent instead). Requires
`NEXT_PUBLIC_META_APP_ID` / `NEXT_PUBLIC_META_LOGIN_CONFIG_ID`; otherwise
the UI can attach a sandbox account with no token. Live publish later
reuses the stored Page token against `/feed`, `/photos`, or IG `/media`.

## Data layer

Users, social accounts, content drafts, and publish-status records live in
MongoDB (`MONGODB_URI`), via the Mongoose models under
[`backend/src/models/`](../backend/src/models/). A demo user, two sandbox
social accounts, and a sample draft are seeded once at boot
([`backend/src/data/seed.js`](../backend/src/data/seed.js)) if they do not
already exist.

The publish job and metrics collection are handled by a unified queue architecture
([`backend/src/queue/`](../backend/src/queue/)). When Redis is configured (`REDIS_URL` or
`REDIS_HOST`), BullMQ (`bullmq`) manages distributed scheduling and workers. In local dev
and test environments without Redis, an in-memory event-driven queue (`InMemoryJobQueue`)
provides identical semantics with exponential backoff retries, delayed scheduling, and job cancellation.

## Publishing engine flow (#10)

1. User/owner triggers publishing via `/posts/publish-approved`, `/posts/:id/publish-now`,
   or `/publish/now` (supporting immediate publish, future `scheduledAt` delays,
   2-3+ connected channels simultaneously, and GBP Local Posts #13 `options`).
2. Workspace ownership check (`validateAccountWorkspaceOwnership` in
   [`backend/src/utils/workspaceValidation.js`](../backend/src/utils/workspaceValidation.js)):
   ensures each selected social account belongs to the requester's active workspace before
   queuing, preventing cross-tenant publishing vulnerabilities. Role-based access enforces
   that only workspace owners can trigger publication (`requireWorkspaceRole("owner")`), while
   workspace editors can author drafts/posts and submit them for owner approval.
3. Post state updates to `scheduled` (when `delay > 0`) or `publishing` (when immediate), and a
   job is queued via `enqueuePublishJob(...)` with exponential backoff retries (`maxRetries`/`attempts`).
4. The queue worker (`publishProcessor.js`) executes the job:
   - Resolves workspace credentials strictly scoped to `workspaceId` (with safe sandbox fallback
     only when no live token exists).
   - Looks up the platform adapter from `adapterRegistry` (`MetaAdapter`, `TwitterAdapter`,
     `LinkedInAdapter`, `GbpAdapter` for GBP Local Posts #13).
   - Calls the adapter's `publish(...)` method. In live mode with credentials, calls the
     real platform API; in sandbox mode, safely simulates publishing and returns a mock external ID.
   - On success: marks post as `published`, sets `publishedAt` and `externalPostId`, and clears
     any prior `errorMessage`.
   - On failure: retries with exponential backoff up to `maxRetries` / BullMQ `attempts` (default 3).
     If all retries exhaust, marks post as `failed` with descriptive `errorMessage`.
   - On server shutdown, `closeQueues()` cleanly closes BullMQ workers/queues and clears in-memory timers.
5. Metrics collection:
   - Immediately following successful publication, the adapter's `getMetrics(...)` is invoked
     to collect initial engagement metrics (reach, likes, comments, shares, clicks), persisted
     to `PostMetrics`.
   - Delayed follow-up metrics jobs are automatically enqueued via `enqueueMetricsJob(...)` to track
     post performance over time, and workspace members can inspect or trigger fresh snapshots via
     `GET /api/v1/posts/:id/metrics` and `POST /api/v1/posts/:id/metrics/refresh`.

## Platform & LLM adapter architecture

### Platform publishing adapters
Every publishing channel inherits from `BaseAdapter`
([`backend/src/services/publishers/BaseAdapter.js`](../backend/src/services/publishers/BaseAdapter.js)):
- **Consistent interface**: `publish(params)`, `getMetrics(params)`, `validateCredentials(account)`.
- **Swappable & mockable**: Registered in `adapterRegistry`, enabling unit tests to swap or mock
  adapters without hitting external APIs or network dependencies.
- **Unified omnichannel channels**:
  - Meta (`facebook`, `instagram`)
  - Twitter / X (`twitter`)
  - LinkedIn (`linkedin`)
  - Google Business Profile (`gbp`) for Local Posts (#13) with `topicType` (`STANDARD` | `EVENT` | `OFFER`),
    `callToAction` buttons, offers, events, and photo support.

### LLM provider adapters
All AI/LLM calls across controllers and services sit behind `BaseLlmAdapter`
([`backend/src/services/llm/BaseLlmAdapter.js`](../backend/src/services/llm/BaseLlmAdapter.js)):
- **Consistent interface**: `generateCaption(params)`, `suggestHashtags(params)`,
  `repurposeContent(params)`, `generateVariants(params)`, `evaluateTone(params)`,
  `checkSensitivity(params)`, and `healthCheck()`.
- **Swappable & mockable**: Registered in `llmAdapterRegistry`
  ([`backend/src/services/llm/llmAdapterRegistry.js`](../backend/src/services/llm/llmAdapterRegistry.js)),
  with [`AiServiceLlmAdapter`](../backend/src/services/llm/AiServiceLlmAdapter.js) registered as the
  default provider (`ai-service`). Controllers, `contentAdaptation.service.js`, and F09 guardrail
  evaluators resolve `getLlmAdapter(...)`, allowing providers to be swapped or mocked cleanly in tests.

## AI microservice boundary

The AI service is deliberately isolated from the core backend:
- Different language/runtime (Python) suits the LLM ecosystem (OpenAI-
  compatible SDK against Groq) better than Node.
- It's a stateless request/response service — no data store, no shared
  state with the backend.
- The Express backend proxies all AI calls (`/api/v1/ai/*`) via `AiServiceLlmAdapter` rather than
  the frontend calling the AI service directly, keeping JWT auth, rate limiting, and provider
  swapping in one place.
- Two independent fallback layers exist so the demo never hard-fails: the
  AI service itself falls back to a template generator if no
  `GROQ_API_KEY`/`OPENAI_API_KEY` is set, and the backend's `ai.controller.js` /
  `contentAdaptation.service.js` fall back to built-in generators if the active LLM
  adapter returns `null` or is unreachable.

## Media uploads

`POST /api/v1/content/media` accepts one image or video file (multer,
in-memory buffer, 25MB limit) and returns it as a base64 `data:` URL. There
is no object storage — the encoded file is only ever held in the browser's
state and the request/response cycle. This is why media doesn't survive a
page refresh: it was never written anywhere durable.

## Known limitations (intentional at this stage)

- No object storage for uploaded media (base64 in memory only).
- When running in local development mode without Redis, in-memory queue timers
  do not persist across process restarts; in production with `REDIS_URL` or
  `REDIS_HOST`, BullMQ provides durable persistence.
- Sandbox social accounts (no live token) run against the sandbox simulators.
- Live Instagram publish sends `image_url`; uploads in this app are `data:`
  URLs, which Graph cannot fetch. Facebook `/photos` already uploads those
  as multipart `source`.
