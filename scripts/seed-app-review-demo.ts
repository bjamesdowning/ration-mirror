/**
 * Idempotent App Review demo account seeder for D1.
 *
 * Creates (or refreshes sample data for) `app-review@mayutic.com` with Cargo,
 * Galley, Manifest, Supply, credits, and AI consent so Apple reviewers see a
 * populated app.
 *
 * Usage:
 *   bun run db:migrate:local                       # ensure local schema
 *   bun scripts/seed-app-review-demo.ts            # local Miniflare D1 (ration-db-dev)
 *   bun scripts/seed-app-review-demo.ts --remote   # production ration-db
 *
 * After a successful run, set Worker secrets (password chosen by you):
 *   echo 'app-review@mayutic.com' | wrangler secret put APP_REVIEW_DEMO_EMAIL
 *   wrangler secret put APP_REVIEW_DEMO_PASSWORD
 *   echo '<printed-user-id>' | wrangler secret put APP_REVIEW_DEMO_USER_ID
 *
 * Enable Flagship `app-review-login` only during App Review / TestFlight review.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CURRENT_TOS_VERSION } from "../app/lib/tos.constants";

const REVIEW_EMAIL = "app-review@mayutic.com";
const REVIEW_NAME = "App Review";
const DEMO_CREDITS = 100;
const remote = process.argv.includes("--remote");
/** Production binding name is `ration-db`; local/dev uses `ration-db-dev`. */
const dbName = remote ? "ration-db" : "ration-db-dev";
const dbFlag = remote ? "--remote" : "--local";
const configFlag = remote ? "" : " --config wrangler.local.jsonc";

interface D1ExecuteChunk {
	results: Record<string, unknown>[];
	success: boolean;
	error?: string;
}

function d1File(sql: string): D1ExecuteChunk[] {
	const dir = mkdtempSync(join(tmpdir(), "ration-seed-"));
	const path = join(dir, "seed.sql");
	writeFileSync(path, sql, "utf8");
	const out = execSync(
		`bunx wrangler d1 execute ${dbName} ${dbFlag}${configFlag} --json --file=${JSON.stringify(path)}`,
		{ encoding: "utf8", cwd: `${import.meta.dir}/..` },
	);
	return JSON.parse(out) as D1ExecuteChunk[];
}

function assertOk(label: string, chunks: D1ExecuteChunk[]) {
	const chunk = chunks[0];
	if (!chunk?.success) {
		throw new Error(`${label}: D1 query failed — ${JSON.stringify(chunks)}`);
	}
	return chunk.results ?? [];
}

function esc(value: string): string {
	return value.replaceAll("'", "''");
}

function todayPlus(days: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function isoNow(): string {
	return new Date().toISOString();
}

async function main() {
	console.log(
		`Seeding App Review demo (${REVIEW_EMAIL}) against ${remote ? "remote" : "local"} D1…\n`,
	);

	const existing = assertOk(
		"lookup user",
		d1File(`SELECT id FROM user WHERE email = '${esc(REVIEW_EMAIL)}' LIMIT 1;`),
	);

	let userId: string;
	let orgId: string;

	if (existing[0]?.id) {
		userId = String(existing[0].id);
		console.log(`✓ user exists: ${userId}`);
		const orgs = assertOk(
			"lookup org",
			d1File(
				`SELECT id FROM organization WHERE slug = 'personal-${esc(userId)}' LIMIT 1;`,
			),
		);
		if (!orgs[0]?.id) {
			throw new Error(
				`User ${userId} has no personal org (slug personal-${userId})`,
			);
		}
		orgId = String(orgs[0].id);
		console.log(`✓ personal org: ${orgId}`);
	} else {
		userId = crypto.randomUUID();
		orgId = crypto.randomUUID();
		const memberId = crypto.randomUUID();
		const settings = esc(
			JSON.stringify({
				defaultGroupId: orgId,
				aiConsentAt: isoNow(),
				onboardingCompletedAt: isoNow(),
				onboardingStep: 6,
				unitDisplayMode: "metric",
			}),
		);

		assertOk(
			"insert user + org + member",
			d1File(`
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, is_admin, tier, welcome_voucher_redeemed, tos_accepted_at, tos_version, settings)
VALUES ('${userId}', '${esc(REVIEW_NAME)}', '${esc(REVIEW_EMAIL)}', 1, unixepoch(), unixepoch(), 0, 'free', 0, unixepoch(), '${esc(CURRENT_TOS_VERSION)}', '${settings}');
INSERT INTO organization (id, name, slug, metadata, created_at, credits)
VALUES ('${orgId}', 'App Review Personal Group', 'personal-${userId}', '{"isPersonal":true}', unixepoch(), ${DEMO_CREDITS});
INSERT INTO member (id, organization_id, user_id, role, created_at)
VALUES ('${memberId}', '${orgId}', '${userId}', 'owner', unixepoch());
`),
		);
		console.log(`✓ created user ${userId} + org ${orgId}`);
	}

	const refreshSettings = esc(
		JSON.stringify({
			defaultGroupId: orgId,
			aiConsentAt: isoNow(),
			onboardingCompletedAt: isoNow(),
			onboardingStep: 6,
			unitDisplayMode: "metric",
		}),
	);

	assertOk(
		"refresh user + credits",
		d1File(`
UPDATE user SET
  email_verified = 1,
  tos_accepted_at = COALESCE(tos_accepted_at, unixepoch()),
  tos_version = '${esc(CURRENT_TOS_VERSION)}',
  settings = '${refreshSettings}',
  updated_at = unixepoch()
WHERE id = '${userId}';
UPDATE organization SET credits = CASE WHEN credits < ${DEMO_CREDITS} THEN ${DEMO_CREDITS} ELSE credits END
WHERE id = '${orgId}';
`),
	);

	const sampleMarker = "app-review-seed";
	const cargoCount = assertOk(
		"count seeded cargo",
		d1File(
			`SELECT COUNT(*) AS c FROM cargo WHERE organization_id = '${orgId}' AND name LIKE '%(${sampleMarker})%';`,
		),
	);
	const alreadySeeded = Number(cargoCount[0]?.c ?? 0) > 0;

	if (alreadySeeded) {
		console.log(
			"✓ sample Cargo/Galley/Manifest/Supply already present — skipped inserts",
		);
	} else {
		const riceId = crypto.randomUUID();
		const oliveId = crypto.randomUUID();
		const frozenId = crypto.randomUUID();
		const mealId = crypto.randomUUID();
		const meal2Id = crypto.randomUUID();
		const listId = crypto.randomUUID();
		const planId = crypto.randomUUID();
		const entryId = crypto.randomUUID();
		const entry2Id = crypto.randomUUID();
		const ing1 = crypto.randomUUID();
		const ing2 = crypto.randomUUID();
		const ing3 = crypto.randomUUID();
		const supply1 = crypto.randomUUID();
		const supply2 = crypto.randomUUID();

		assertOk(
			"insert sample content",
			d1File(`
INSERT INTO cargo (id, organization_id, name, quantity, unit, base_quantity, base_unit, domain, status, expires_at, created_at, updated_at) VALUES
 ('${riceId}', '${orgId}', 'Basmati rice (${sampleMarker})', 1, 'kg', 1000, 'g', 'food', 'stable', NULL, unixepoch(), unixepoch()),
 ('${oliveId}', '${orgId}', 'Olive oil (${sampleMarker})', 500, 'ml', 500, 'ml', 'food', 'stable', NULL, unixepoch(), unixepoch()),
 ('${frozenId}', '${orgId}', 'Frozen peas (${sampleMarker})', 400, 'g', 400, 'g', 'food', 'stable', unixepoch() + 60*60*24*45, unixepoch(), unixepoch());

INSERT INTO meal (id, organization_id, name, domain, type, description, directions, equipment, servings, prep_time, cook_time, custom_fields, created_at, updated_at) VALUES
 ('${mealId}', '${orgId}', 'Rice bowl (${sampleMarker})', 'food', 'recipe', 'Simple review demo meal', '["Rinse rice","Cook 15 min","Serve with peas"]', '["pot"]', 2, 5, 15, '{}', unixepoch(), unixepoch()),
 ('${meal2Id}', '${orgId}', 'Olive oil pasta (${sampleMarker})', 'food', 'recipe', 'Second demo meal', '["Boil water","Toss with oil"]', '["pot"]', 2, 5, 12, '{}', unixepoch(), unixepoch());

INSERT INTO meal_ingredient (id, meal_id, cargo_id, ingredient_name, quantity, unit, base_quantity, base_unit, is_optional, order_index) VALUES
 ('${ing1}', '${mealId}', '${riceId}', 'Basmati rice', 100, 'g', 100, 'g', 0, 0),
 ('${ing2}', '${mealId}', '${frozenId}', 'Frozen peas', 100, 'g', 100, 'g', 0, 1),
 ('${ing3}', '${meal2Id}', '${oliveId}', 'Olive oil', 30, 'ml', 30, 'ml', 0, 0);

INSERT INTO supply_list (id, organization_id, name, created_at, updated_at)
VALUES ('${listId}', '${orgId}', 'Weekly run (${sampleMarker})', unixepoch(), unixepoch());

INSERT INTO supply_item (id, list_id, name, quantity, unit, base_quantity, base_unit, domain, is_purchased, source_meal_ids, source_origins, created_at) VALUES
 ('${supply1}', '${listId}', 'Eggs (${sampleMarker})', 12, 'unit', 12, 'unit', 'food', 0, '[]', '["manual"]', unixepoch()),
 ('${supply2}', '${listId}', 'Lemons (${sampleMarker})', 3, 'unit', 3, 'unit', 'food', 0, '[]', '["manual"]', unixepoch());

INSERT INTO meal_plan (id, organization_id, name, is_archived, created_at, updated_at)
VALUES ('${planId}', '${orgId}', 'Review week (${sampleMarker})', 0, unixepoch(), unixepoch());

INSERT INTO meal_plan_entry (id, plan_id, meal_id, date, slot_type, order_index, created_at) VALUES
 ('${entryId}', '${planId}', '${mealId}', '${todayPlus(0)}', 'dinner', 0, unixepoch()),
 ('${entry2Id}', '${planId}', '${meal2Id}', '${todayPlus(1)}', 'dinner', 0, unixepoch());
`),
		);

		console.log("✓ seeded Cargo, Galley, Manifest, Supply sample rows");
	}

	console.log(`
Done.

APP_REVIEW_DEMO_USER_ID=${userId}
APP_REVIEW_DEMO_EMAIL=${REVIEW_EMAIL}

Next (production):
  echo '${REVIEW_EMAIL}' | wrangler secret put APP_REVIEW_DEMO_EMAIL
  wrangler secret put APP_REVIEW_DEMO_PASSWORD   # choose a strong static password
  echo '${userId}' | wrangler secret put APP_REVIEW_DEMO_USER_ID

Flagship: create boolean flag app-review-login (default off). Enable only during App Review.
`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
