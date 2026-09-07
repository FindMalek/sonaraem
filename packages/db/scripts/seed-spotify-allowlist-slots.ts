import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const { db } = await import("@sonaraem/db");
const { spotifyAllowlistSlot } = await import(
	"@sonaraem/db/schema/spotify-allowlist"
);

// Total Dev Mode cap is 5 (#290): 1 seat is the admin's own account and is
// never represented here, 3 rotate for background sync/export, 1 is
// reserved for login so a live user never queues behind background work.
const ROTATION_SLOTS = 3;
const LOGIN_SLOTS = 1;

// Run once after deploying this migration — see the PR description for the
// operational checklist (clearing the real dashboard down to just the admin
// account first). Idempotent: safe to re-run, only inserts rows that are
// missing relative to the target counts below.
async function main() {
	const existing = await db
		.select({ id: spotifyAllowlistSlot.id, kind: spotifyAllowlistSlot.kind })
		.from(spotifyAllowlistSlot);

	const existingRotation = existing.filter((s) => s.kind === "rotation").length;
	const existingLogin = existing.filter((s) => s.kind === "login").length;

	const toInsert: (typeof spotifyAllowlistSlot.$inferInsert)[] = [];
	for (let i = existingRotation; i < ROTATION_SLOTS; i++) {
		toInsert.push({ kind: "rotation" });
	}
	for (let i = existingLogin; i < LOGIN_SLOTS; i++) {
		toInsert.push({ kind: "login" });
	}

	if (toInsert.length === 0) {
		console.info(
			`Already seeded: ${existingRotation} rotation + ${existingLogin} login slot(s) — nothing to do.`,
		);
		process.exit(0);
	}

	await db.insert(spotifyAllowlistSlot).values(toInsert);

	console.info(
		`Inserted ${toInsert.length} slot(s) — now ${Math.max(existingRotation, ROTATION_SLOTS)} rotation + ${Math.max(existingLogin, LOGIN_SLOTS)} login.`,
	);
}

await main().catch((err) => {
	console.error(err);
	process.exit(1);
});
