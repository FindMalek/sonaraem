# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.
Rules are maintained in `.cursor/rules/` as the single source of truth — all agents read from there.

## Rules

@.cursor/rules/00-project-overview.mdc
@.cursor/rules/01-naming-conventions.mdc
@.cursor/rules/02-code-patterns.mdc
@.cursor/rules/03-github-workflow.mdc

### Packages

@.cursor/rules/packages/trigger.mdc
@.cursor/rules/packages/ui.mdc

## Commits

Follow `.cursor/rules` (conventional prefixes). Do not put assistant, IDE, or vendor tool names in commit messages, PR titles, or PR descriptions, and do not add `Co-authored-by:` for tools.

## Database (local dev)

- `pnpm db:studio` — Drizzle Studio against `SONARAEM_DATABASE_URL`.
- `pnpm db:reset` — truncate user-data tables; keeps auth, `genre_domain`, and Drizzle migration history. Re-sync Spotify / re-run organize afterward.
- `pnpm db:nuke` — Docker volume wipe + `db:push` (expects `localhost:5433`). See `.env.example` for override flags.

## Self-hosting

See [SELFHOST.md](./SELFHOST.md) for the full self-hosting guide, including a runbook aimed specifically at an AI agent doing first-time setup cold (what to ask the human operator for, what it can figure out itself, and common pitfalls around Spotify's Dev Mode 5-user allowlist cap).
