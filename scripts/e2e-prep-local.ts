#!/usr/bin/env bun
/**
 * Prepare local D1 for E2E: migrate, and reset corrupted Miniflare D1 if needed.
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const D1_STATE_DIR = join(
	ROOT,
	".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const forceReset = process.argv.includes("--force-reset");

function migrateLocal(): { ok: boolean; output: string } {
	const result = spawnSync(
		"wrangler",
		[
			"d1",
			"migrations",
			"apply",
			"ration-db-dev",
			"--local",
			"--config",
			"wrangler.local.jsonc",
		],
		{
			cwd: ROOT,
			encoding: "utf-8",
		},
	);
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	return { ok: result.status === 0, output };
}

function isCorruptD1Error(output: string): boolean {
	return /SQLITE_IOERR|disk I\/O error|SQLITE_CORRUPT|SQLITE_NOTADB/i.test(
		output,
	);
}

let attempt = migrateLocal();
if (forceReset || (!attempt.ok && isCorruptD1Error(attempt.output))) {
	if (forceReset) {
		console.warn("[e2e-prep] Forcing local D1 reset…");
	} else {
		console.warn(
			"[e2e-prep] Local D1 appears corrupted — resetting Miniflare D1 state and retrying…",
		);
	}
	rmSync(D1_STATE_DIR, { recursive: true, force: true });
	attempt = migrateLocal();
}

if (!attempt.ok) {
	console.error(attempt.output);
	console.error(
		"\n[e2e-prep] Local D1 migrate failed. Try: bun run db:reset:local",
	);
	process.exit(1);
}

if (attempt.output.trim()) {
	process.stdout.write(attempt.output);
}
