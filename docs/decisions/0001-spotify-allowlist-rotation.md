# 0001 — Spotify Dev Mode allowlist rotation (v2)

Status: **Accepted** (2026-09-17) — supersedes the permanent-allocation model from #392.

## Context

Spotify's Dev Mode caps this app at 5 allowlisted users, with an additional undocumented, empirically-discovered throttle: ~5 allowlist ADD calls per rolling 24h, app-wide (#390). A first attempt at working around this via a rotating slot pool (#290 → #371/#372/#385) was live-tested, hit that throttle within a day of normal usage, and was reverted to a fixed, permanent 4-user allocation (#392) — simple and safe, but caps the product at exactly 4 customers forever, with zero seats left as of today.

Product decision: revisit rotation, but this time design explicitly around the discovered constraint instead of discovering it in production.

Full quantitative analysis (request-cost model, capacity tables, λ/μ stability argument, two-app scenario): see the discussion on #290 and #391.

## Decision

- Treat **5 ADDs/24h and 5 REMOVEs/24h as two separate hard ceilings**, tracked as rolling sliding-window logs (not fixed daily resets — Spotify doesn't document window boundaries).
- **Use only 4 of each 5 as usable budget**, keeping 1 in reserve for boundary uncertainty.
- 1 seat is permanently reserved for the admin account and never enters rotation; the remaining 4 seats rotate.
- REMOVE is treated as equally throttled as ADD, as a deliberate conservative assumption — only ADD throttling is empirically confirmed (#390); this should be verified with a real test before it becomes load-bearing.
- Default snapshot-refresh interval moves from a fixed 3 days to **21–30 days, pull-based** (refresh on demand when a user is actually active, not a blind periodic sweep of everyone) — the refresh interval directly sets the sustainable population ceiling (`N_max ≈ interval × cycles/day reserved for refresh`), so a short interval caps growth regardless of scheduler quality.
- Every allowlist "visit" for a user must **consolidate all pending work** (onboarding + sync + export) into one add→work→remove cycle, and reset that user's next-due date on any successful visit for any reason. Splitting one user's work across two visits silently doubles real mutation cost.
- New state machine for onboarding: waitlist approval no longer implies an immediate allowlist add. A user moves through `APPROVED_WAITING → CONNECT_QUEUED → READY_TO_CONNECT` (a refillable pool sized to remaining daily budget, 48h + 24h reminder/timeout, then back to waitlist requiring resubmission) before ever touching Spotify.

## Consequences

- Population capacity becomes a direct function of refresh interval and daily budget, not a fixed number — see #290 for the interval-vs-population table.
- Weekly-for-everyone digest/refresh is no longer viable as a default (caps population at ~14 regardless of everything else); becomes an opt-in/paid-tier feature if kept.
- More automation, more surface area for correctness bugs in the "did I already touch this user this window" logic, and a larger, more visible version of the automation risk originally accepted in #290 for a handful of internal test accounts (Spotify's Feb 2026 Dev Mode changes were explicitly framed as targeting this exact pattern — accepted, on record, not to be relitigated per-PR).
- Second Spotify Developer account (#391), when pursued, plugs in as a fully independent second rotation pool (own sliding-window trackers, own admin seat) rather than requiring a redesign.

## Addendum (#290) — scoped down for the actual target

The population math above was worked out for a much larger ceiling than this project actually needs. The real target is 7-8 friends today with headroom to ~14, personal project, no paying users, no scaling plan — and the Playwright-driven automation is kept intentionally rather than replaced with a manual process.

At that scale, the `APPROVED_WAITING → CONNECT_QUEUED → READY_TO_CONNECT` onboarding-admission pool described above (with its 48h/72h timeout reaper) was removed. It exists to ration a scarce onboarding budget across a *growing* waitlist — at 7-8 lifetime signups there's never a queue to ration. `waitlist-admission-controller.ts`, `connect-reservation-reaper.ts`, and `connect-queue.ts` are deleted; a friend is admitted directly once approved, going through the same synchronous pre-OAuth allowlist gate (`ensureAllowlisted`) as any other admission, with capacity gated purely by how many rotating seats are currently occupied.

## References

- #240 — Extended Quota Mode outlook (why rotation is being pursued instead of production access)
- #290 — rotation epic; full math model and the v2 spec this doc summarizes
- #371 / #372 / #385 — first rotation attempt (built, then reverted)
- #390 — the throttle discovery that killed the first attempt
- #391 — second-app scenario
- #392 — the permanent-allocation model this decision supersedes
