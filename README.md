# Sonaraem

<p align="center">
  <img alt="Sonaraem" src="./github.png" />
</p>

> AI-powered music organization — sync your Spotify library, classify every track, and auto-generate playlists by mood, theme, and vibe.

<p align="center">
  <a href="https://github.com/FindMalek/sonaraem">
    <img alt="Repo stats" src="https://shieldcn.dev/group/github/last-commit/FindMalek/sonaraem+github/stars/FindMalek/sonaraem+badge/license-MIT-18181b.svg?variant=secondary&mode=dark&color=18181b" />
  </a>
</p>


<p align="center">
  <img alt="Next.js" src="https://shieldcn.dev/badge/-Next.js-18181b.svg?logo=nextdotjs&variant=secondary&mode=dark" />
  <img alt="TypeScript" src="https://shieldcn.dev/badge/-TypeScript-18181b.svg?logo=typescript&variant=secondary&mode=dark" />
  <img alt="Drizzle ORM" src="https://shieldcn.dev/badge/-Drizzle-18181b.svg?logo=drizzle&variant=secondary&mode=dark" />
  <img alt="Turborepo" src="https://shieldcn.dev/badge/-Turborepo-18181b.svg?logo=turborepo&variant=secondary&mode=dark" />
</p>


<!-- STATS:START -->
<!-- STATS:DATA tracksEmbedded=4318 tracksTagged=3712 playlistsGenerated=16 -->
<p align="center">
  <img alt="Library stats" src="https://shieldcn.dev/group/badge/Tracks_embedded-4318-18181b+badge/Tracks_tagged-3712-18181b+badge/Playlists_generated-16-18181b.svg?variant=secondary&mode=dark" />
</p>
<p align="center"><sub>Last updated: 2026-09-03</sub></p>
<!-- STATS:END -->

## What it does

1. **Sync** — pulls your full Spotify saved tracks + playlists
2. **Classify** — runs each track through an LLM to extract mood, themes, vibe, energy, era, and genre
3. **Embed** — generates semantic vector embeddings from the classification
4. **Cluster** — groups tracks by similarity using DBSCAN
5. **Generate** — creates AI-named playlists per cluster, enforcing artist diversity
6. **Export** — pushes playlists back to Spotify

## Stack

| Layer | Technology |
|---|---|
| Apps | Next.js 16 (App Router), React 19 |
| API | oRPC (type-safe RPC + OpenAPI) |
| Auth | Better Auth — dual instances (dashboard Spotify + admin email/password) |
| Database | PostgreSQL + Drizzle ORM (Neon in production) |
| Background jobs | Trigger.dev v4 |
| LLM | Groq (`gpt-oss-20b` classify; `gpt-oss-120b` playlist/cluster) |
| Embeddings | OpenAI `text-embedding-3-small` |
| Clustering | DBSCAN (`density-clustering`) |
| Monorepo | pnpm + Turborepo |
| Formatting | Biome |

## Repo Structure

```
apps/
  api         Next.js API server (port 3002)
  dashboard   User dashboard — Spotify OAuth, waitlist-gated (port 3003)
  web         Public waitlist signup (port 3001)
  admin       Internal admin — waitlist approval (port 3004)

packages/
  auth        Dual Better Auth factories (dashboard + admin)
  common      Schemas, services, Trigger.dev tasks, waitlist utilities
  config      Shared TypeScript config
  core        Auth/DB singletons (dashboardAuth, adminAuth)
  db          Drizzle schema + migrations
  env         Zod-validated environment variables
  logger      Pino structured logging
  orpc        oRPC routers, procedures, context
  tracing     OpenTelemetry
  ui          shadcn/ui component library
  email       React Email templates + Resend
```

## Getting Started

**Prerequisites:** Node.js 20+, pnpm 10+, Docker Desktop

```bash
git clone https://github.com/FindMalek/sonaraem.git
cd sonaraem
pnpm install
cp .env.example .env     # fill in values
pnpm db:setup            # start local Postgres + push schema
pnpm dev:api             # start API + Trigger.dev worker
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full setup guide.

## Waitlist flow

```text
Web signup → confirmation email (/waiting?token=...)
     ↓
Admin approves → invite email (/api/invite/{token})
     ↓
Spotify OAuth → redeem invite → user.isApproved = true → onboarding → dashboard
```

Returning approved users sign in at dashboard `/login` without an invite link.

## Admin dashboard (local)

```bash
pnpm db:push
pnpm db:seed              # seeds the admin user below
pnpm dev:admin            # admin only (port 3004) — needs API on :3002
# or
pnpm dev:ada              # API + dashboard + admin (ports 3002/3003/3004)
```

Open [http://127.0.0.1:3004/login](http://127.0.0.1:3004/login) and sign in with:

- Email: `admin@sonaraem.com`
- Password: `changeme123!`

| Page | Purpose |
|------|---------|
| `/` | Platform stats |
| `/waitlist` | Approve, reject, resend invite, notes |
| `/users` | User list (role, approval, banned) |

**Auth isolation:** Admin uses `/api/admin-auth` (`sonaraem-admin` cookie). Dashboard uses `/api/auth` (`sonaraem-dashboard` cookie). Signing into one does not sign you into the other.

## Testing

```bash
pnpm test                 # vitest in @sonaraem/common + @sonaraem/orpc
pnpm check-types          # TypeScript
pnpm check                # Biome
```

## Environment Variables

All variables are prefixed `SONARAEM_` (server) or `NEXT_PUBLIC_SONARAEM_` (client). Copy `.env.example` and fill in:

- `SONARAEM_DATABASE_URL` — local: `postgresql://postgres:password@localhost:5433/sonaraem`
- `SONARAEM_SPOTIFY_CLIENT_ID` / `SONARAEM_SPOTIFY_CLIENT_SECRET` — Spotify Developer Dashboard
- `SONARAEM_RESEND_API_KEY` / `SONARAEM_EMAIL_FROM` — waitlist emails
- `SONARAEM_OPENAI_API_KEY` — embeddings
- `SONARAEM_GROQ_API_KEY` — LLM classification and playlist generation
- `SONARAEM_TRIGGER_SECRET_KEY` / `SONARAEM_TRIGGER_PROJECT_REF` — [cloud.trigger.dev](https://cloud.trigger.dev)

**Production note:** API rate limits are in-memory per process. Use Redis (or similar) before running multiple API instances.

## Star History

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/shieldcn/star-chart-dark.svg">
  <img alt="Star history" src=".github/shieldcn/star-chart-light.svg">
</picture>

## Contributors

[![Contributors](https://shieldcn.dev/contributors/FindMalek/sonaraem.svg?theme=violet)](https://github.com/FindMalek/sonaraem/graphs/contributors)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
