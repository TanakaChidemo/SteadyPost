# Deployment

There is no staging/production deployment target yet, so there is nothing
to run a deploy runbook against. Persistence is already MongoDB
(`MONGODB_URI`) — see [`ARCHITECTURE.md`](ARCHITECTURE.md) — not an
in-memory store. Publish jobs are still in-process, and uploaded media is
still a `data:` URL with no object storage.

For local use, see [`RUNNING.md`](RUNNING.md) — `docker compose up --build`
after setting `MONGODB_URI` is the whole story.

## If this ever needs a real deployment

A production deployment would still need to cover:

- A managed MongoDB (Atlas or equivalent) and a plan for schema changes
  as the Mongoose models evolve.
- Secrets management: `MONGODB_URI`, `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_SECRET`, `META_APP_SECRET`,
  `GROQ_API_KEY`/`OPENAI_API_KEY` — injected via a secrets store, never
  committed.
- A durable publish queue if jobs must survive backend restarts (today
  they run via `setImmediate` in the API process).
- Object storage for uploaded media (today only a base64 `data:` URL in
  the request/browser).
- A container registry + a `docker-compose.prod.yml` (or equivalent) that
  builds each service's `production` Dockerfile target.
- A reverse proxy (Nginx/Caddy) for TLS in front of the frontend/backend.
- Basic monitoring: uptime checks on `/health` for each service, and log
  shipping.

None of this is wired up yet — it's flagged here so it isn't a surprise
later, not because it's needed for the current demo.
