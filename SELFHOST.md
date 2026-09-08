# Self-Hosting Sonaraem

Sonaraem is designed to run as a small, fixed-capacity deployment: **one Spotify Developer app, 5 total Spotify accounts** (4 real users + 1 admin/dev account), because Spotify's Dev Mode allowlist hard-caps at 5 emails and there is no automation left to churn through more (see [`.cursor/rules/packages/trigger.mdc`](./.cursor/rules/packages/trigger.mdc) for why). This guide covers standing up your own instance.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (local Postgres) — or a hosted Postgres with the `pgvector` extension (e.g. [Neon](https://neon.tech))
- A [Spotify Developer](https://developer.spotify.com/dashboard) account
- A [Resend](https://resend.com) account (transactional email)
- A [Trigger.dev](https://cloud.trigger.dev) account (background jobs — sync, classify, cluster, export, the weekly digest cron)
- Optional: an LLM/embedding provider key — [Groq](https://console.groq.com) (classification, playlist naming) and [OpenAI](https://platform.openai.com) (embeddings)

## 1. Clone and install

```bash
git clone https://github.com/FindMalek/sonaraem.git
cd sonaraem
pnpm install
cp .env.example .env
```

## 2. Create the Spotify Developer app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Set the redirect URI to `{NEXT_PUBLIC_SONARAEM_API_URL}/api/auth/callback/spotify` — e.g. `http://127.0.0.1:3002/api/auth/callback/spotify` locally, or your real API domain in production.
3. Copy the Client ID and Client Secret into `.env` as `SONARAEM_SPOTIFY_CLIENT_ID` / `SONARAEM_SPOTIFY_CLIENT_SECRET`.
4. **This is one app, one client ID — do not create a second one.** The app stays in Spotify's Dev Mode (not Extended Quota Mode), which caps it at 5 allowlisted accounts total.
5. In the app's **Users and Access** settings, manually add the email of the account you want to use as the admin/dev seat, and set that same email as `SONARAEM_SPOTIFY_ALLOWLIST_ADMIN_EMAIL` in `.env`.

The other 4 seats fill themselves in automatically: the app adds a user's Spotify email to the allowlist the moment they first sign in (`hooks.before` on `/sign-in/social`, see `packages/auth/src/index.ts`), and never removes it. A 5th real-user sign-in attempt is rejected with an app-level "at capacity" error before it ever reaches Spotify. This requires a one-time manual login to the automation account — see step 5.

## 3. Database

```bash
pnpm db:setup   # starts Docker Postgres (pgvector) on :5433 and pushes the schema
```

Using a hosted Postgres instead of Docker: set `SONARAEM_DATABASE_URL` in `.env` first (it needs the `pgvector` extension enabled), then run `pnpm db:push` directly.

Day-to-day database commands (`pnpm db:studio`, `pnpm db:reset`, `pnpm db:nuke`) are documented in [`CLAUDE.md`](./CLAUDE.md) — use those rather than raw `psql`/`drizzle-kit` calls.

Seed the admin dashboard user (hardcoded local credentials, not for production — see step 7):

```bash
pnpm db:seed
```

## 4. Background jobs (Trigger.dev)

1. Create a project at [cloud.trigger.dev](https://cloud.trigger.dev).
2. Set `SONARAEM_TRIGGER_SECRET_KEY` (Project → API Keys) and `SONARAEM_TRIGGER_PROJECT_REF` (Project → Settings) in `.env`.
3. For a production deploy, also generate a Personal Access Token (your Trigger.dev profile, not the project) and set `SONARAEM_TRIGGER_ACCESS_TOKEN`, then run `pnpm deploy:trigger` to push task code.

This is what runs the organize pipeline (sync → classify → embed → cluster → generate → export) and the weekly digest cron (`organizeWeeklyCronTask`, Mondays 08:00 — see `packages/common/src/trigger/tasks/organize-weekly-cron.ts`). No separate cron infrastructure is needed; Trigger.dev's own schedule fires it once the task is deployed.

## 5. Seed the Spotify allowlist automation session

The one-time real adds to the Spotify allowlist are done by a headless browser driving the Developer Dashboard UI (there's no public API for it). It needs a logged-in session for the admin/automation account once:

```bash
pnpm --filter @sonaraem/common exec playwright install chromium   # one-time, downloads the browser binary
pnpm --filter @sonaraem/common run bootstrap:spotify-allowlist-session
```

This opens a real browser — log into the account you set as `SONARAEM_SPOTIFY_ALLOWLIST_ADMIN_EMAIL` (including any email OTP prompt), press Enter in the terminal once you're on the Dashboard's Users page, and the session gets saved (encrypted with `SONARAEM_SPOTIFY_ALLOWLIST_SESSION_KEY`, generate one with `openssl rand -base64 32`). Re-run this if a sign-in ever fails with "No saved Spotify allowlist session" or "Saved session didn't reach the Users table" in the logs — the saved session expired.

If a real user's OTP prompt needs a human to relay a code by hand, the admin app's `/spotify-login-relay` page exists for exactly that.

## 6. Email (Resend)

Set `SONARAEM_RESEND_API_KEY` and a verified sender identity `SONARAEM_EMAIL_FROM` (e.g. `Sonaraem <hello@yourdomain.com>`). Without these, email sends are skipped (logged, not fatal) — useful for a first pass, but waitlist invites, the weekly digest, and reauth reminders all depend on this being set for a real deployment.

## 7. Run it

**Development:**

```bash
pnpm dev:ada   # API + dashboard + admin + Trigger.dev worker, ports 3002/3003/3004
```

Sign in to the admin app at `http://127.0.0.1:3004/login` with `admin@sonaraem.com` / `changeme123!` (from `pnpm db:seed` — change this before deploying anywhere real: it's a hardcoded local-only credential, see `packages/db/scripts/seed-admin.ts`). Approve yourself on the waitlist (or sign in directly if already approved) and connect Spotify from the dashboard at `http://127.0.0.1:3003`.

**Production:** each app under `apps/` (`web`, `dashboard`, `admin`, `api`, `email`) is an independent Next.js app with its own `vercel.json` — deploy them as four separate Vercel projects (or any Node hosting that runs `next build && next start`), pointing each app's `NEXT_PUBLIC_SONARAEM_*_URL` env vars at its real deployed URL. `pnpm build` builds all of them. API rate limiting is in-memory per process — put a shared store (Redis or similar) in front of it before running more than one API instance.

## Environment variable reference

All variables live in [`.env.example`](./.env.example) with inline comments; the essentials by area:

| Area | Required vars |
|---|---|
| Database | `SONARAEM_DATABASE_URL` |
| App URLs | `NEXT_PUBLIC_SONARAEM_API_URL`, `_WEB_URL`, `_DASHBOARD_URL`, `_ADMIN_URL` |
| Auth | `SONARAEM_BETTER_AUTH_SECRET` |
| Spotify OAuth | `SONARAEM_SPOTIFY_CLIENT_ID`, `SONARAEM_SPOTIFY_CLIENT_SECRET` |
| Spotify allowlist | `SONARAEM_SPOTIFY_ALLOWLIST_SESSION_KEY`, `SONARAEM_SPOTIFY_ALLOWLIST_ADMIN_EMAIL` |
| Email | `SONARAEM_RESEND_API_KEY`, `SONARAEM_EMAIL_FROM` |
| Background jobs | `SONARAEM_TRIGGER_SECRET_KEY`, `SONARAEM_TRIGGER_PROJECT_REF` |
| LLM/embeddings (optional) | `SONARAEM_GROQ_API_KEY`, `SONARAEM_OPENAI_API_KEY` |

Every `process.env.*` read in the codebase goes through `@sonaraem/env`'s Zod schemas (`packages/env/src/modules/`) — if a required var is missing, the app fails fast at startup with a clear message rather than at some later runtime call.

---

## Runbook for an AI agent doing first-time setup

If you're an agent setting this up cold, in order:

1. **Ask the human operator for**, before doing anything else:
   - A Postgres connection string (or confirm you should provision local Docker Postgres yourself — you can, via `pnpm db:setup`)
   - Spotify Developer app Client ID/Secret, and which email should be the admin/allowlist-admin seat (or offer to walk them through creating the app per step 2 above — you cannot create a Spotify Developer app yourself, it requires their Spotify login)
   - Resend API key + verified sender address (or confirm it's fine to leave email disabled for now)
   - Trigger.dev project ref + secret key (or confirm background jobs/the weekly digest can stay off for now)
2. **You can figure out yourself, no need to ask**: `pnpm install`, `.env` scaffolding from `.env.example`, generating `SONARAEM_BETTER_AUTH_SECRET` and `SONARAEM_SPOTIFY_ALLOWLIST_SESSION_KEY` (`openssl rand -base64 32`), starting Docker Postgres, running migrations/`db:push`, running `pnpm db:seed`, running `pnpm build`/`pnpm test`/`pnpm dev:*` to verify things work.
3. **Do not attempt to automate the Spotify allowlist seeding step (step 5 above)** — it requires a human to complete a real Spotify login (and possibly an email OTP) in an interactive browser window. Tell the operator to run `pnpm --filter @sonaraem/common run bootstrap:spotify-allowlist-session` themselves; don't try to script around it.
4. **Common pitfalls**:
   - Forgetting the Dev Mode 5-user cap: OAuth sign-in for a 5th real user will fail loudly with an app-level "at capacity" message — this is expected, not a bug, until the app is granted Spotify Extended Quota Mode (out of scope for a self-host setup).
   - A missing/expired allowlist automation session surfaces as "No saved Spotify allowlist session" or "Saved session didn't reach the Users table" in logs on the very first real sign-in attempt — re-run step 5.
   - `browserType.launch: Executable doesn't exist` means `playwright install chromium` (step 5) was skipped.
   - Do not create a second Spotify app/client ID to try to get more capacity — the app is built around exactly one.
   - `pnpm build` requires every required env var to be a real-shaped, non-empty value (even a placeholder) or it fails validation — see the CI workflow's `build` job env block for known-good placeholders if you just need a build to succeed without real credentials.
