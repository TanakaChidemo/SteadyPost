# Running the App

This is a step-by-step guide to get the app running locally, including the
gotchas that aren't obvious from a first read of the README.

There is no database to set up. All data (users, social accounts, drafts)
is hardcoded in `backend/src/data/store.js` and lives only in memory — it
resets every time the backend restarts.

## 1. Prerequisites

You need **Docker** and the **Docker Compose plugin**. That's it — the Node
backend, the Python AI service, and the Next.js frontend all run in
containers.

### Installing Docker

**Arch Linux:**
```bash
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```
Then **fully log out and back in** (or reboot). Group membership only takes
effect on a new login session — restarting a terminal or running `newgrp
docker` in an existing session is not always enough.

**Debian/Ubuntu:**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```
Then log out and back in.

**macOS/Windows:** install Docker Desktop, which includes Compose.

Verify it worked:
```bash
docker --version
docker compose version
docker ps          # should list containers, not error with "permission denied"
```
If `docker ps` gives a permission error, the daemon isn't running
(`sudo systemctl status docker`) or your group membership hasn't refreshed
(log out/in again).

## 2. Set up environment files

From the repo root:
```bash
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env
cp frontend/.env.local.example frontend/.env.local
```
The defaults work out of the box — you don't need to change anything to
get the app running.

### Optional: "Sign in with Google"

Google login is optional — email/password sign-up works out of the box with
no setup. If you want to test the Google button:

1. Create an OAuth client at
   [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   (Web application type). Set the authorized redirect URI to
   `http://localhost:4000/api/v1/auth/oauth/google/callback`.
2. Leave the OAuth consent screen in **Testing** mode — as the project
   owner your own Google account can sign in without needing app
   verification.
3. Put the Client ID/Secret in `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

Because everyone runs the backend on `http://localhost:4000` in dev, the
redirect URI above is identical for every developer's machine — there's no
need for each teammate to create their own Google Cloud project. Share one
"dev" OAuth client's Client ID/Secret across the team (through a password
manager, not the repo) and everyone pastes the same two values into their
own local `backend/.env`.

**Gotcha:** the callback redirects the browser to `FRONTEND_URL` (from
`backend/.env`, defaults to `http://localhost:3000`) once sign-in
completes. If you've changed the frontend's port mapping in
`docker-compose.yml` — for example to avoid clashing with another project
already using port 3000 — update `FRONTEND_URL` to match, or Google login
will silently redirect you into whatever else is running on the old port
instead of this app.

### Optional: real AI generation

Without any AI key, the AI service falls back to a canned template — it
still works, just isn't very varied. For real AI-generated captions:

1. Sign up for free at [console.groq.com](https://console.groq.com) — no
   credit card required.
2. Create an API key under **API Keys**.
3. Paste it into `ai-service/.env`:
   ```
   GROQ_API_KEY=gsk_...
   ```
(`OPENAI_API_KEY` in the same file is an optional paid fallback if you'd
rather use OpenAI; Groq is checked first.)

## 3. Start the stack

```bash
docker compose up --build
```
First run pulls base images and installs all dependencies, so it takes a
few minutes. Subsequent runs are much faster. Leave this running in its own
terminal (or add `-d` to run in the background).

## 4. Open the app

- Frontend: http://localhost:3000
- Backend health: http://localhost:4000/health
- API docs (Swagger UI): http://localhost:4000/api/docs
- AI service health: http://localhost:5001/health

Sign in to try it: either register a new account, or log in with the
seeded demo account (`demo@example.com` / `password123`), which already has
two social accounts (Instagram + Facebook) and a sample draft connected —
nothing else to configure to try the full flow.

## Troubleshooting

**`docker: command not found` right after installing** — you likely ran the
install in one shell and are checking in another that was started before
the PATH/group changes applied. Open a fresh terminal.

**`permission denied while trying to connect to the docker API`** — your
user isn't in the `docker` group yet, or the group membership hasn't
refreshed. Run `groups` — if `docker` isn't listed, log out and back in
(not just a new terminal tab).

**Changed a value in a `.env` file and it's not taking effect** —
`docker compose restart <service>` does **not** reload `env_file` contents;
it just restarts the process in the same container. Recreate it instead:
```bash
docker compose up -d --force-recreate <service>
```

**`npm run build` inside the frontend container crashes with
`TypeError: Cannot read properties of null (reading 'useContext')`** — this
happens if you run a production build (`next build`) inside the `frontend`
service's container, because `docker-compose.yml` sets `NODE_ENV=development`
there for `next dev`. A production build needs `NODE_ENV` unset or set to
`production`:
```bash
docker compose run --rm -e NODE_ENV=production frontend npm run build
```
This doesn't affect normal usage — `docker compose up` (dev mode) and CI
(which never sets `NODE_ENV`) are both unaffected.

**I restarted the backend and my drafts/accounts are gone** — that's
expected. Nothing is persisted at this stage of the project; restarting
resets everything back to the seed data in `backend/src/data/store.js`.

## Stopping everything

```bash
docker compose down
```

## Running without Docker

Only needed for editor tooling/IntelliSense — see the README's
"Running services individually" section. You'll need Node.js 20+ and
Python 3.12+. No database installs required.
