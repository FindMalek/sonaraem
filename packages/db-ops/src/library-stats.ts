import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const { createSessionDb } = await import("./lib/create-session-db");
const { playlist } = await import("@sonaraem/db/schema/playlist");
const { track } = await import("@sonaraem/db/schema/track");
const { trackAnalysis } = await import("@sonaraem/db/schema/track-analysis");
const { count, countDistinct, eq, isNotNull } = await import("drizzle-orm");

const README_PATH = path.join(repoRoot, "README.md");
const STATS_COLOR = "18181b";
const STATS_START = "<!-- STATS:START -->";
const STATS_END = "<!-- STATS:END -->";
const STATS_DATA_RE =
	/<!-- STATS:DATA tracksEmbedded=(\d+) tracksTagged=(\d+) playlistsGenerated=(\d+) -->/;

function renderStatsBlock(
	tracksEmbedded: number,
	tracksTagged: number,
	playlistsGenerated: number,
	lastUpdated: string,
): string {
	const badgeUrl =
		`https://shieldcn.dev/group/badge/Tracks_embedded-${tracksEmbedded}-${STATS_COLOR}` +
		`+badge/Tracks_tagged-${tracksTagged}-${STATS_COLOR}` +
		`+badge/Playlists_generated-${playlistsGenerated}-${STATS_COLOR}.svg?variant=secondary&mode=dark`;

	return [
		STATS_START,
		`<!-- STATS:DATA tracksEmbedded=${tracksEmbedded} tracksTagged=${tracksTagged} playlistsGenerated=${playlistsGenerated} -->`,
		`<p align="center">`,
		`  <img alt="Library stats" src="${badgeUrl}" />`,
		"</p>",
		`<p align="center"><sub>Last updated: ${lastUpdated}</sub></p>`,
		STATS_END,
	].join("\n");
}

function readExistingCounts(content: string): {
	tracksEmbedded: number;
	tracksTagged: number;
	playlistsGenerated: number;
} | null {
	const match = content.match(STATS_DATA_RE);
	if (!match) return null;
	const [, embedded, tagged, generated] = match;
	if (!embedded || !tagged || !generated) return null;
	return {
		tracksEmbedded: Number(embedded),
		tracksTagged: Number(tagged),
		playlistsGenerated: Number(generated),
	};
}

const { db, release } = await createSessionDb();
let tracksEmbedded: number;
let tracksTagged: number;
let playlistsGenerated: number;
try {
	const [embeddedRows, taggedRows, generatedRows] = await Promise.all([
		db.select({ total: count() }).from(track).where(isNotNull(track.embedding)),
		db
			.select({ total: countDistinct(trackAnalysis.trackId) })
			.from(trackAnalysis),
		db
			.select({ total: count() })
			.from(playlist)
			.where(eq(playlist.isGenerated, true)),
	]);

	tracksEmbedded = embeddedRows[0]?.total ?? 0;
	tracksTagged = taggedRows[0]?.total ?? 0;
	playlistsGenerated = generatedRows[0]?.total ?? 0;
} finally {
	await release();
}

const readme = fs.readFileSync(README_PATH, "utf-8");
const existingCounts = readExistingCounts(readme);

if (
	existingCounts &&
	existingCounts.tracksEmbedded === tracksEmbedded &&
	existingCounts.tracksTagged === tracksTagged &&
	existingCounts.playlistsGenerated === playlistsGenerated
) {
	console.info("library-stats: counts unchanged, leaving README.md untouched.");
	process.exit(0);
}

if (!readme.includes(STATS_START) || !readme.includes(STATS_END)) {
	throw new Error(
		`library-stats: README.md is missing the ${STATS_START}/${STATS_END} markers.`,
	);
}

const lastUpdated = new Date().toISOString().slice(0, 10);
const block = renderStatsBlock(
	tracksEmbedded,
	tracksTagged,
	playlistsGenerated,
	lastUpdated,
);

const nextReadme = readme.replace(
	new RegExp(`${STATS_START}[\\s\\S]*?${STATS_END}`),
	block,
);

fs.writeFileSync(README_PATH, nextReadme);
console.info(
	`library-stats: updated README.md (embedded=${tracksEmbedded}, tagged=${tracksTagged}, generated=${playlistsGenerated}).`,
);
