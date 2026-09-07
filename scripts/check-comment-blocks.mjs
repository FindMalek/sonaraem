#!/usr/bin/env node
// Fails if a PR *adds* 2+ consecutive new `//` line comments — this repo's
// convention (.cursor/rules/02-code-patterns.mdc, "No Comments Rule") is one
// line, always; no wrapped explanation paragraphs. Doesn't touch /** */
// blocks, a separate, legitimate convention.
//
// Scoped to the diff against `base`, not the whole repo: there are existing
// violations pending cleanup, and this should gate new code, not require
// fixing history before it can turn on.
import { execFileSync } from "node:child_process";

const EXCLUDE_DIRS = [
	"node_modules/",
	"/.next/",
	"/dist/",
	"/.react-email/",
	"/migrations/meta/",
];

const base = process.argv[2] ?? process.env.COMMENT_CHECK_BASE ?? "origin/main";

const diff = execFileSync(
	"git",
	["diff", "--unified=0", `${base}...HEAD`, "--", "*.ts", "*.tsx"],
	{
		cwd: new URL("..", import.meta.url),
		encoding: "utf8",
		maxBuffer: 1024 * 1024 * 64,
	},
);

let currentFile = null;
let newLineNum = 0;
let runStart = null;
const violations = [];

function flushRun(endLineExclusive) {
	if (runStart !== null && endLineExclusive - runStart >= 2) {
		violations.push(`${currentFile}:${runStart}-${endLineExclusive - 1}`);
	}
	runStart = null;
}

for (const line of diff.split("\n")) {
	if (line.startsWith("+++ b/")) {
		flushRun(newLineNum);
		currentFile = line.slice("+++ b/".length);
		continue;
	}
	if (line.startsWith("@@")) {
		flushRun(newLineNum);
		const match = /\+(\d+)/.exec(line);
		newLineNum = match ? Number.parseInt(match[1], 10) : 0;
		continue;
	}
	if (!currentFile || EXCLUDE_DIRS.some((dir) => currentFile.includes(dir))) {
		continue;
	}
	if (line.startsWith("---") || line.startsWith("\\")) continue;

	if (line.startsWith("+")) {
		const isComment = line.slice(1).trim().startsWith("//");
		if (isComment) {
			if (runStart === null) runStart = newLineNum;
		} else {
			flushRun(newLineNum);
		}
		newLineNum++;
	} else if (!line.startsWith("-")) {
		// Context line — shouldn't appear with --unified=0, but handle it anyway.
		flushRun(newLineNum);
		newLineNum++;
	}
}
flushRun(newLineNum);

if (violations.length > 0) {
	for (const v of violations) {
		console.error(`${v}  new multi-line // comment block`);
	}
	console.error(
		`\n${violations.length} new multi-line comment block(s). Compress each to one line — see .cursor/rules/02-code-patterns.mdc.`,
	);
	process.exit(1);
}

console.info("No new multi-line comment blocks.");
