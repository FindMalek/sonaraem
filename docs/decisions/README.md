# Architecture & business decisions

This folder holds decision records for cross-cutting technical or business calls — the "why does the system work this way" that outlives any single issue thread.

It is not user-facing documentation and not an API reference. It's a durable log of decisions, for when the reasoning behind something needs to survive longer than a scrolled-past GitHub thread.

## Format

Each entry is a short markdown file: `NNNN-short-title.md`, numbered sequentially.

A decision doc has four parts:

- **Context** — what problem or constraint forced a decision.
- **Decision** — what was actually decided.
- **Consequences** — what this makes easier, harder, or forecloses.
- **References** — links to the GitHub issues where it was actually discussed. Don't duplicate the discussion here; link to it.

Keep these short. If a decision changes later, add a new entry that supersedes the old one rather than editing history — link both directions.

## Index

- [0001 — Spotify Dev Mode allowlist rotation](./0001-spotify-allowlist-rotation.md)
