import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const { db } = await import("@sonaraem/db");
const { user } = await import("@sonaraem/db/schema/auth");
const { spotifyAllowlistSlot, spotifyAllowlistQueueRequest } = await import(
	"@sonaraem/db/schema/spotify-allowlist"
);
const { inArray } = await import("drizzle-orm");
const { enqueue, tryAcquireSlot, releaseSlot } = await import(
	"../src/services/spotify-allowlist/queue"
);

// Exercises the real SKIP LOCKED acquisition path against real Postgres —
// the mocked-db unit tests can't catch a concurrency bug in the actual
// row-locking behaviour. Run against local dev only (never prod): this
// inserts and deletes throwaway `user` and queue-request rows.
//
//   pnpm --filter @sonaraem/common load-test:allowlist-queue

const POLL_INTERVAL_MS = 50;
const ACQUIRE_TIMEOUT_MS = 20_000;
const MIN_WORK_MS = 100;
const MAX_WORK_MS = 400;

type Priority = "login" | "manual" | "cron";

// 4 login, 8 manual, 8 cron = 20. cron starts first, manual next, login
// last — on purpose, so we're actually testing whether later-arriving
// higher-priority requests jump already-waiting lower-priority ones, not
// just who happened to ask first.
const PLAN: { priority: Priority; startDelayMs: number }[] = [
	...Array.from({ length: 8 }, () => ({
		priority: "cron" as const,
		startDelayMs: 0,
	})),
	...Array.from({ length: 8 }, () => ({
		priority: "manual" as const,
		startDelayMs: 75,
	})),
	...Array.from({ length: 4 }, () => ({
		priority: "login" as const,
		startDelayMs: 150,
	})),
];

type Outcome = {
	label: string;
	priority: Priority;
	requestId: number;
	slotId: number;
	enqueuedAt: number;
	acquiredAt: number;
	releasedAt: number;
};

type Failure = { label: string; priority: Priority; reason: string };

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOne(
	index: number,
	priority: Priority,
	startDelayMs: number,
	userIds: string[],
): Promise<Outcome | Failure> {
	const label = `${priority}-${index}`;
	const userId = userIds[index];
	if (!userId) throw new Error(`No seeded user for ${label}`);
	const email = `${label}@loadtest.sonaraem.invalid`;

	await sleep(startDelayMs);

	const enqueuedAt = Date.now();
	const { requestId } = await enqueue({ userId }, priority);

	const deadline = enqueuedAt + ACQUIRE_TIMEOUT_MS;
	let slotId: number | null = null;
	while (Date.now() < deadline) {
		const result = await tryAcquireSlot(requestId, email);
		if (result.acquired) {
			slotId = result.slotId;
			break;
		}
		await sleep(POLL_INTERVAL_MS);
	}

	if (slotId === null) {
		return { label, priority, reason: "timed out waiting for a slot" };
	}

	const acquiredAt = Date.now();
	await sleep(MIN_WORK_MS + Math.random() * (MAX_WORK_MS - MIN_WORK_MS));
	await releaseSlot(slotId);
	const releasedAt = Date.now();

	return {
		label,
		priority,
		requestId,
		slotId,
		enqueuedAt,
		acquiredAt,
		releasedAt,
	};
}

function isFailure(o: Outcome | Failure): o is Failure {
	return "reason" in o;
}

async function main() {
	console.info(`Seeding ${PLAN.length} throwaway users…`);
	const userIds = PLAN.map((_, i) => `loadtest-${i}-${Date.now()}`);
	await db.insert(user).values(
		userIds.map((id, i) => ({
			id,
			name: `Load Test ${i}`,
			email: `${id}@loadtest.sonaraem.invalid`,
		})),
	);

	console.info(
		`Firing ${PLAN.length} concurrent requests (8 cron, 8 manual, 4 login)…`,
	);
	const results = await Promise.all(
		PLAN.map((p, i) => runOne(i, p.priority, p.startDelayMs, userIds)),
	);

	const failures = results.filter(isFailure);
	const outcomes = results.filter((r): r is Outcome => !isFailure(r));

	// Invariant 1: every request eventually got served.
	if (failures.length > 0) {
		console.error(`${failures.length} request(s) never acquired a slot:`);
		for (const f of failures) console.error(`  ${f.label}: ${f.reason}`);
	}

	// Invariant 2: no slot was ever held by two requests at once.
	const bySlot = new Map<number, Outcome[]>();
	for (const o of outcomes) {
		const arr = bySlot.get(o.slotId) ?? [];
		arr.push(o);
		bySlot.set(o.slotId, arr);
	}
	let overlaps = 0;
	for (const [slotId, occupants] of bySlot) {
		const sorted = [...occupants].sort((a, b) => a.acquiredAt - b.acquiredAt);
		for (let i = 1; i < sorted.length; i++) {
			const prev = sorted[i - 1];
			const curr = sorted[i];
			if (!prev || !curr) continue;
			if (curr.acquiredAt < prev.releasedAt) {
				overlaps++;
				console.error(
					`OVERLAP on slot ${slotId}: ${prev.label} held until ${prev.releasedAt}, ${curr.label} acquired at ${curr.acquiredAt}`,
				);
			}
		}
	}

	// Invariant 3: login requests only ever land on login-kind slots, and vice versa.
	const slotKinds = new Map(
		(
			await db
				.select({
					id: spotifyAllowlistSlot.id,
					kind: spotifyAllowlistSlot.kind,
				})
				.from(spotifyAllowlistSlot)
		).map((s) => [s.id, s.kind]),
	);
	let poolMismatches = 0;
	for (const o of outcomes) {
		const kind = slotKinds.get(o.slotId);
		const expected = o.priority === "login" ? "login" : "rotation";
		if (kind !== expected) {
			poolMismatches++;
			console.error(
				`POOL MISMATCH: ${o.label} (priority ${o.priority}) acquired slot ${o.slotId} of kind ${kind}, expected ${expected}`,
			);
		}
	}

	// Stats per class — the actual point of the reserved login slot is that
	// its wait-time distribution should look nothing like rotation's.
	function percentile(sorted: number[], p: number): number {
		if (sorted.length === 0) return 0;
		const idx = Math.min(
			sorted.length - 1,
			Math.ceil((p / 100) * sorted.length) - 1,
		);
		return sorted[Math.max(0, idx)] ?? 0;
	}

	function waitStats(priority: Priority) {
		const waits = outcomes
			.filter((o) => o.priority === priority)
			.map((o) => o.acquiredAt - o.enqueuedAt)
			.sort((a, b) => a - b);
		if (waits.length === 0) return "n/a";
		const sum = waits.reduce((a, b) => a + b, 0);
		const avg = Math.round(sum / waits.length);
		return (
			`n=${waits.length}  min ${waits[0]}ms  avg ${avg}ms  ` +
			`p50 ${percentile(waits, 50)}ms  p95 ${percentile(waits, 95)}ms  max ${waits[waits.length - 1]}ms`
		);
	}

	const totalDurationMs =
		Math.max(...outcomes.map((o) => o.releasedAt), 0) -
		Math.min(...outcomes.map((o) => o.enqueuedAt), Date.now());

	console.info("\n--- Wait time to acquire a slot, by priority ---");
	console.info(`login:  ${waitStats("login")}`);
	console.info(`manual: ${waitStats("manual")}`);
	console.info(`cron:   ${waitStats("cron")}`);

	console.info("\n--- Slot utilization ---");
	for (const [slotId, occupants] of [...bySlot.entries()].sort(
		(a, b) => a[0] - b[0],
	)) {
		const kind = slotKinds.get(slotId) ?? "?";
		const busyMs = occupants.reduce(
			(sum, o) => sum + (o.releasedAt - o.acquiredAt),
			0,
		);
		console.info(
			`slot ${slotId} (${kind}): served ${occupants.length} request(s), busy ${busyMs}ms of ${totalDurationMs}ms wall time (${Math.round((busyMs / totalDurationMs) * 100)}%)`,
		);
	}

	console.info(
		`\nTotal: ${outcomes.length}/${PLAN.length} requests served in ${totalDurationMs}ms wall time`,
	);

	// Cleanup — delete throwaway rows and reset slot state.
	await db
		.delete(spotifyAllowlistQueueRequest)
		.where(inArray(spotifyAllowlistQueueRequest.userId, userIds));
	await db.delete(user).where(inArray(user.id, userIds));
	await db
		.update(spotifyAllowlistSlot)
		.set({ status: "available", userId: null, email: null })
		.where(inArray(spotifyAllowlistSlot.id, [...slotKinds.keys()]));

	const ok = failures.length === 0 && overlaps === 0 && poolMismatches === 0;
	console.info(
		`\n${ok ? "PASS" : "FAIL"} — ${failures.length} timeout(s), ${overlaps} overlap(s), ${poolMismatches} pool mismatch(es).`,
	);
	process.exit(ok ? 0 : 1);
}

await main().catch((err) => {
	console.error(err);
	process.exit(1);
});
