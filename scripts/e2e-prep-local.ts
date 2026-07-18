#!/usr/bin/env bun
/**
 * Prepare local D1 for E2E: migrate, and reset corrupted Miniflare D1 if needed.
 *
 * Also repairs workerd `_cf_ALARM` skew: wrangler CLI may use a newer workerd
 * than `@cloudflare/vite-plugin` and leave a 3-column `_cf_ALARM` that fatals
 * local `dev:local` (INSERT still uses two values).
 */
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const WRANGLER_STATE_V3 = join(ROOT, ".wrangler/state/v3");
const D1_STATE_DIR = join(WRANGLER_STATE_V3, "d1/miniflare-D1DatabaseObject");
const forceReset = process.argv.includes("--force-reset");

function migrateLocal(): { ok: boolean; output: string } {
	const wranglerBin = join(ROOT, "node_modules/.bin/wrangler");
	const result = spawnSync(
		wranglerBin,
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

function findMetadataSqliteFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			found.push(...findMetadataSqliteFiles(path));
		} else if (entry.name === "metadata.sqlite") {
			found.push(path);
		}
	}
	return found;
}

/**
 * Force the 2-column `_cf_ALARM` schema expected by older vite-plugin workerd.
 * Must run after `wrangler d1 migrations apply --local` (newer workerd).
 */
function repairCfAlarmSchema(): void {
	for (const path of findMetadataSqliteFiles(WRANGLER_STATE_V3)) {
		try {
			const db = new Database(path);
			const cols = db
				.query<{ name: string }, []>("PRAGMA table_info(_cf_ALARM)")
				.all();
			if (cols.some((c) => c.name === "actor_name")) {
				db.exec(`
					DROP TABLE IF EXISTS _cf_ALARM;
					CREATE TABLE _cf_ALARM (
						actor_id TEXT PRIMARY KEY NOT NULL,
						scheduled_time INTEGER
					) WITHOUT ROWID;
				`);
				console.warn(
					`[e2e-prep] Recreated 2-column _cf_ALARM for local vite-plugin workerd in ${path}`,
				);
			}
			db.close();
		} catch {
			// Missing table or unreadable DB — ignore.
		}
	}
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

repairCfAlarmSchema();

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
