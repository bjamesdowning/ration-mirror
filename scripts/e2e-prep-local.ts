#!/usr/bin/env bun
/**
 * Prepare local D1 for E2E: migrate, and reset corrupted Miniflare D1 if needed.
 *
 * Applies `drizzle/*.sql` through Miniflare's D1 binding (same persist path
 * wrangler uses). The wrangler CLI `d1 migrations apply --local` path hangs in
 * this environment: it waits on an interactive confirm when stdout is a TTY,
 * and the full local worker config (Flagship/AI) can stall workerd before SQL
 * runs.
 *
 * Also repairs workerd `_cf_ALARM` skew: wrangler CLI may use a newer workerd
 * than `@cloudflare/vite-plugin` and leave a 3-column `_cf_ALARM` that fatals
 * local `dev:local` (INSERT still uses two values).
 */
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import {
	compareMigrationNames,
	splitDrizzleStatements,
} from "../app/lib/drizzle-sql";

const ROOT = join(import.meta.dir, "..");
const WRANGLER_STATE_V3 = join(ROOT, ".wrangler/state/v3");
const D1_PERSIST = join(WRANGLER_STATE_V3, "d1");
const D1_STATE_DIR = join(D1_PERSIST, "miniflare-D1DatabaseObject");
const DRIZZLE_DIR = join(ROOT, "drizzle");
/** Matches wrangler.local.jsonc `d1_databases[0].database_id`. */
const LOCAL_D1_UUID = "eec9f2f0-5d34-4392-89dd-317f373bf1e9";
const MIGRATIONS_TABLE = "d1_migrations";
const forceReset = process.argv.includes("--force-reset");

function listLocalDrizzleSqlFiles(dir: string): string[] {
	return readdirSync(dir)
		.filter((name) => name.endsWith(".sql"))
		.sort(compareMigrationNames);
}

async function applyPendingMigrations(): Promise<{
	ok: boolean;
	output: string;
}> {
	const mf = new Miniflare({
		modules: true,
		script: "",
		d1Persist: D1_PERSIST,
		d1Databases: { DATABASE: LOCAL_D1_UUID },
	});
	const lines: string[] = [];
	try {
		const db = await mf.getD1Database("DATABASE");
		await db
			.prepare(
				`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL UNIQUE,
					applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
				)`,
			)
			.run();

		const appliedRows = await db
			.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`)
			.all<{ name: string }>();
		const applied = new Set((appliedRows.results ?? []).map((row) => row.name));

		const files = listLocalDrizzleSqlFiles(DRIZZLE_DIR);
		let appliedCount = 0;
		for (const file of files) {
			if (applied.has(file)) continue;
			const sql = readFileSync(join(DRIZZLE_DIR, file), "utf8");
			const statements = [
				...splitDrizzleStatements(sql),
				`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ('${file.replace(/'/g, "''")}')`,
			];
			const prepared = statements.map((statement) => db.prepare(statement));
			const first = prepared[0];
			if (!first) continue;
			await db.batch([first, ...prepared.slice(1)]);
			appliedCount += 1;
			lines.push(`Applied ${file}`);
		}
		if (appliedCount === 0) {
			lines.push("No migrations to apply!");
		} else {
			lines.push(`Applied ${appliedCount} migration(s).`);
		}
		return { ok: true, output: `${lines.join("\n")}\n` };
	} catch (error) {
		const message =
			error instanceof Error ? (error.stack ?? error.message) : String(error);
		return { ok: false, output: message };
	} finally {
		await mf.dispose();
	}
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
 * Must run after local D1 migrate (newer workerd).
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

let attempt = await applyPendingMigrations();
if (forceReset || (!attempt.ok && isCorruptD1Error(attempt.output))) {
	if (forceReset) {
		console.warn("[e2e-prep] Forcing local D1 reset…");
	} else {
		console.warn(
			"[e2e-prep] Local D1 appears corrupted — resetting Miniflare D1 state and retrying…",
		);
	}
	rmSync(D1_STATE_DIR, { recursive: true, force: true });
	attempt = await applyPendingMigrations();
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
