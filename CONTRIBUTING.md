# Contributing to Sonaraem

Thanks for contributing. This guide explains how to get the repo running locally and how to work on issues efficiently.

## Before You Start

Install these tools first:

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

Architecture and conventions are documented in `.cursor/rules/`.

## Repository Setup

```bash
git clone https://github.com/FindMalek/sonaraem.git
cd sonaraem
pnpm install
```

Copy the environment file and fill in at minimum the database URL:

```bash
cp .env.example .env
```

Start local infrastructure and push the schema:

```bash
pnpm db:setup   # starts Docker Postgres + pushes Drizzle schema
```

For Trigger.dev background jobs, fill in `SONARAEM_TRIGGER_SECRET_KEY` and `SONARAEM_TRIGGER_PROJECT_REF` from [cloud.trigger.dev](https://cloud.trigger.dev).

## Most-Used Scripts

### Development

```bash
pnpm dev:api        # API + Trigger.dev worker (most common)
pnpm dev:ad         # API + dashboard + Trigger.dev
pnpm dev:admin      # admin app only (port 3004; API must be running)
pnpm dev:ada        # API + dashboard + admin + Trigger.dev
pnpm dev:all        # all apps + Trigger.dev
pnpm dev:web        # web app only
```

### Admin dashboard (local)

```bash
pnpm db:push
pnpm db:seed        # creates admin@sonaraem.com / changeme123!
pnpm dev:ada        # API + dashboard + admin
```

Open [http://127.0.0.1:3004/login](http://127.0.0.1:3004/login) and sign in with `admin@sonaraem.com` / `changeme123!`. Admin auth uses `/api/admin-auth` and is **separate** from dashboard Spotify sessions.

### Quality checks

```bash
pnpm check-types    # TypeScript across all packages
pnpm test           # vitest (@sonaraem/common + @sonaraem/orpc)
pnpm check          # Biome check + fix
pnpm lint           # Biome lint + fix
pnpm format         # Biome format + fix
```

### Dependency sync

Run monthly or before a release to bump workspace packages, refresh the lockfile, and align versions across `package.json` files (catalog entries stay in `pnpm-workspace.yaml`):

```bash
pnpm deps:sync
```

`pnpm update -r --latest` can pull breaking majors — review the lockfile diff before merging. Commit dependency bumps in a dedicated PR separate from feature work.

### Database

```bash
pnpm db:push        # push schema to local Postgres
pnpm db:studio      # open Drizzle Studio UI
pnpm db:generate    # generate migration files
pnpm db:migrate     # apply schema migrations (production)
pnpm db:ops:generate my-fix   # scaffold a db-ops data migration
pnpm db:ops:migrate           # run pending db-ops migrations (local + prod CI)
pnpm db:ops:migrate --dry-run --only my-fix      # test without writes (point .env at target DB)
pnpm db:ops:status            # show db-ops ledger vs files
pnpm db:seed        # seed local admin user (admin@sonaraem.com / changeme123!, hardcoded — local dev only)
```

## Waitlist & Access Control

Sonaraem runs a closed beta:

1. **Web** (`:3001`) — public waitlist signup
2. **Admin** (`:3004`) — approve/reject; sends invite email
3. **Dashboard** (`:3003`) — Spotify login + invite redemption → `user.isApproved = true`

Gating is enforced at **both** the dashboard proxy (`apps/dashboard/src/proxy.ts`) and the API (`approvedProcedure`). Admin and dashboard use **separate auth cookies** — logging into admin does not log you into the dashboard.

After deploying the approval gate to an existing database, run `pnpm db:migrate` to apply the grandfather migration for existing users.

## Creating a Branch

Branch names follow this pattern:

```
feat/{short-description}
fix/{short-description}
chore/{short-description}
```

Always branch from `main`.

## Commit Messages

Follow the conventional commits format:

```
feat: add artist diversity cap to playlist generation
fix: pass SONARAEM_GROQ_API_KEY explicitly to createGroq
chore: update CONTRIBUTING.md
perf: add p-limit concurrency to embed stage
refactor: extract playlist card into separate component
```

## Pull Requests

- Link every PR to a GitHub issue with `Closes #N` in the description
- Fill in the PR template checklist before requesting review
- Keep PRs focused — one feature or fix per PR

## Code Conventions

All conventions are documented in `.cursor/rules/`. The short version:

- **Never `process.env` directly** — use `@sonaraem/env`
- **Never `groq()` without explicit key** — use `createGroq({ apiKey: env.SONARAEM_GROQ_API_KEY })`
- **Tabs for indentation**, double quotes, Biome for formatting
- **Component files**: kebab-case, always include a skeleton variant
- **No comments** unless the WHY is non-obvious
