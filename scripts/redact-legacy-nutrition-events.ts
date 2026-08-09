/**
 * Operator script: redact legacy personal nutrition fields from kitchen_event
 * payloads (energyKcal, portionServings, verified, manifestDate).
 *
 * Input JSON via stdin (from wrangler d1 execute --json):
 * [
 *   { "id": "...", "payload": "{\"planId\":\"…\",\"energyKcal\":400,…}" }
 * ]
 * or { "results": [ { "results": [ ...rows ] } ] } wrangler wrapper.
 *
 * Example dry-run:
 *   wrangler d1 execute DB --remote --json --command \
 *     "SELECT id, payload FROM kitchen_event WHERE json_extract(payload, '$.energyKcal') IS NOT NULL LIMIT 500" \
 *     | bun scripts/redact-legacy-nutrition-events.ts --dry-run
 *
 * Apply:
 *   … | bun scripts/redact-legacy-nutrition-events.ts > /tmp/redact-nutrition-events.sql
 *   wrangler d1 execute DB --remote --file=/tmp/redact-nutrition-events.sql
 *
 * Prints counts only — never logs payload contents.
 */
import {
	hasPersonalNutritionPayloadFields,
	redactPersonalNutritionFromPayload,
} from "../app/lib/kitchen-event-privacy";

type Row = { id?: unknown; payload?: unknown };

function parseBatchSize(): number {
	const raw = Bun.argv.find((arg) => arg.startsWith("--batch-size="));
	const parsed = raw ? Number(raw.split("=")[1]) : 200;
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
		throw new Error("--batch-size must be an integer from 1 to 1000");
	}
	return parsed;
}

function isDryRun(): boolean {
	return Bun.argv.includes("--dry-run");
}

function escapeSqlString(value: string): string {
	return value.replaceAll("'", "''");
}

function unwrapRows(raw: unknown): Row[] {
	if (Array.isArray(raw)) {
		if (
			raw.length > 0 &&
			Array.isArray((raw[0] as { results?: unknown }).results)
		) {
			return (raw as Array<{ results: Row[] }>).flatMap((r) => r.results ?? []);
		}
		return raw as Row[];
	}
	if (raw && typeof raw === "object" && "results" in raw) {
		const results = (raw as { results: unknown }).results;
		if (Array.isArray(results)) {
			if (
				results.length > 0 &&
				results[0] &&
				typeof results[0] === "object" &&
				"results" in (results[0] as object)
			) {
				return (results as Array<{ results: Row[] }>).flatMap(
					(r) => r.results ?? [],
				);
			}
			return results as Row[];
		}
	}
	throw new Error("Expected JSON array of { id, payload } rows");
}

function parsePayload(raw: unknown): Record<string, unknown> | null {
	if (raw == null) return null;
	if (typeof raw === "object" && !Array.isArray(raw)) {
		return raw as Record<string, unknown>;
	}
	if (typeof raw === "string") {
		try {
			const parsed = JSON.parse(raw) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return null;
		}
	}
	return null;
}

const dryRun = isDryRun();
const batchSize = parseBatchSize();
const stdin = await Bun.stdin.text();
const rows = unwrapRows(JSON.parse(stdin) as unknown);

let scanned = 0;
let dirty = 0;
const updates: string[] = [];

for (const row of rows) {
	scanned += 1;
	if (typeof row.id !== "string" || row.id.trim().length === 0) {
		continue;
	}
	const payload = parsePayload(row.payload);
	if (!payload || !hasPersonalNutritionPayloadFields(payload)) continue;
	dirty += 1;
	const redacted = redactPersonalNutritionFromPayload(payload);
	const json = escapeSqlString(JSON.stringify(redacted));
	updates.push(
		`UPDATE kitchen_event SET payload = json('${json}') WHERE id = '${escapeSqlString(row.id)}';`,
	);
}

console.error(
	JSON.stringify({
		scanned,
		wouldUpdate: dirty,
		dryRun,
		batchSize,
	}),
);

if (dryRun) {
	process.exit(0);
}

for (let i = 0; i < updates.length; i += batchSize) {
	const chunk = updates.slice(i, i + batchSize);
	console.log("BEGIN TRANSACTION;");
	for (const stmt of chunk) console.log(stmt);
	console.log("COMMIT;");
}
