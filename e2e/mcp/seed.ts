/**
 * Seed one test kitchen for the MCP e2e suite.
 *
 * Writes straight into the local Miniflare D1 after the drizzle migrations.
 * Every id is fixed so tool cases can reference rows by name. The API key is
 * minted here with a fresh random secret on every run; it only ever exists in
 * this process and the in-memory D1.
 */

import { getNutritionConsentStatement } from "../../app/lib/nutrition/consent-policy";

/** The slice of the D1 binding the seed uses (Miniflare's proxy satisfies it). */
export type SeedDatabase = {
	prepare(query: string): {
		bind(...values: unknown[]): unknown;
	};
	batch(statements: unknown[]): Promise<unknown>;
};

export const SEED_IDS = {
	userId: "e2e00000-0000-4000-8000-000000000001",
	organizationId: "e2e00000-0000-4000-8000-000000000002",
	memberId: "e2e00000-0000-4000-8000-000000000003",
	apiKeyId: "e2e00000-0000-4000-8000-000000000004",
	tagDairyId: "e2e00000-0000-4000-8000-000000000010",
	tagProduceId: "e2e00000-0000-4000-8000-000000000011",
	cargoMilkId: "e2e00000-0000-4000-8000-000000000020",
	cargoCheddarId: "e2e00000-0000-4000-8000-000000000021",
	cargoCarrotsId: "e2e00000-0000-4000-8000-000000000022",
	cargoRiceId: "e2e00000-0000-4000-8000-000000000023",
	mealSoupId: "e2e00000-0000-4000-8000-000000000030",
	mealPancakesId: "e2e00000-0000-4000-8000-000000000031",
	planId: "e2e00000-0000-4000-8000-000000000040",
	entryCookedId: "e2e00000-0000-4000-8000-000000000041",
} as const;

/** Every scope a first-party agent key can hold, nutrition included. */
export const SEED_SCOPES = [
	"mcp:read",
	"mcp:inventory:write",
	"mcp:galley:write",
	"mcp:manifest:write",
	"mcp:supply:write",
	"mcp:preferences:write",
	"mcp:nutrition:read",
	"mcp:nutrition:write",
] as const;

export type SeedResult = {
	apiKey: string;
	today: string;
	ids: typeof SEED_IDS;
};

function utcToday(now: Date): string {
	return now.toISOString().slice(0, 10);
}

function seconds(date: Date): number {
	return Math.floor(date.getTime() / 1000);
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

/** `rtn_live_` + 32 hex, the same shape api-key.server.ts issues. */
function mintApiKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const secret = Array.from(bytes, (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	return `rtn_live_${secret}`;
}

const SOUP_PER_SERVING = {
	energyKcal: 420,
	proteinG: 24,
	fatG: 9,
	carbG: 60,
	fiberG: 12,
	sugarG: null,
	satFatG: null,
	sodiumMg: null,
	saltG: null,
};

const CARGO_NUTRITION = {
	source: "user_override",
	confidence: 1,
	verified: false,
	per100g: {
		energyKcal: 64,
		proteinG: 3.3,
		fatG: 3.6,
		carbG: 4.8,
		fiberG: 0,
		sugarG: 4.8,
		satFatG: 2.3,
		sodiumMg: 44,
		saltG: 0.11,
	},
	perServing: null,
	fdcId: null,
	description: "e2e reference food",
};

export async function seedMcpKitchen(
	db: SeedDatabase,
	now = new Date(),
): Promise<SeedResult> {
	const ids = SEED_IDS;
	const apiKey = mintApiKey();
	const keyHash = await sha256Hex(apiKey);
	const today = utcToday(now);
	const nowS = seconds(now);
	const day = 86_400;
	const statements: unknown[] = [];
	const run = (sql: string, ...values: unknown[]) => {
		statements.push(db.prepare(sql).bind(...values));
	};

	run(
		`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, settings, tier, tos_accepted_at)
		 VALUES (?, ?, ?, 1, ?, ?, '{}', 'free', ?)`,
		ids.userId,
		"E2E Agent Owner",
		"mcp-e2e@example.test",
		nowS,
		nowS,
		nowS,
	);
	run(
		`INSERT INTO organization (id, name, slug, created_at, credits) VALUES (?, ?, ?, ?, 0)`,
		ids.organizationId,
		"E2E Kitchen",
		"e2e-kitchen",
		nowS,
	);
	run(
		`INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`,
		ids.memberId,
		ids.organizationId,
		ids.userId,
		nowS,
	);
	run(
		`INSERT INTO api_key (id, organization_id, user_id, key_hash, key_prefix, name, scopes, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		ids.apiKeyId,
		ids.organizationId,
		ids.userId,
		keyHash,
		apiKey.slice(0, 17),
		"MCP e2e",
		JSON.stringify(SEED_SCOPES),
		nowS,
	);

	for (const purpose of ["goals", "intake", "agent_processing"] as const) {
		const statement = await getNutritionConsentStatement(purpose);
		run(
			`INSERT INTO nutrition_consent (id, user_id, purpose, policy_version, source, granted_at, created_at,
			   statement_version, statement_sha256, privacy_notice_version, client_surface)
			 VALUES (?, ?, ?, ?, 'web', ?, ?, ?, ?, ?, 'web')`,
			`e2e-consent-${purpose}`,
			ids.userId,
			purpose,
			statement.policyVersion,
			nowS - day,
			nowS - day,
			statement.statementVersion,
			statement.sha256,
			statement.privacyNoticeVersion,
		);
	}

	run(
		`INSERT INTO tag (id, organization_id, slug, name, created_by, created_at) VALUES (?, ?, 'dairy', 'Dairy', ?, ?)`,
		ids.tagDairyId,
		ids.organizationId,
		ids.userId,
		nowS,
	);
	run(
		`INSERT INTO tag (id, organization_id, slug, name, created_by, created_at) VALUES (?, ?, 'produce', 'Produce', ?, ?)`,
		ids.tagProduceId,
		ids.organizationId,
		ids.userId,
		nowS,
	);

	const cargoRows: Array<{
		id: string;
		name: string;
		quantity: number;
		unit: string;
		expiresAt: number | null;
		nutrition: unknown;
		createdAt: number;
	}> = [
		{
			id: ids.cargoMilkId,
			name: "Whole milk",
			quantity: 1000,
			unit: "ml",
			expiresAt: nowS + 2 * day,
			nutrition: CARGO_NUTRITION,
			createdAt: nowS - 40,
		},
		{
			id: ids.cargoCheddarId,
			name: "Mature cheddar",
			quantity: 200,
			unit: "g",
			expiresAt: nowS + 20 * day,
			nutrition: null,
			createdAt: nowS - 30,
		},
		{
			id: ids.cargoCarrotsId,
			name: "Carrots",
			quantity: 6,
			unit: "unit",
			expiresAt: null,
			nutrition: null,
			createdAt: nowS - 20,
		},
		{
			id: ids.cargoRiceId,
			name: "Basmati rice",
			quantity: 1000,
			unit: "g",
			expiresAt: null,
			nutrition: CARGO_NUTRITION,
			createdAt: nowS - 10,
		},
	];
	for (const row of cargoRows) {
		run(
			`INSERT INTO cargo (id, organization_id, name, quantity, unit, domain, status, expires_at, created_at, updated_at, nutrition)
			 VALUES (?, ?, ?, ?, ?, 'food', 'stable', ?, ?, ?, ?)`,
			row.id,
			ids.organizationId,
			row.name,
			row.quantity,
			row.unit,
			row.expiresAt,
			row.createdAt,
			row.createdAt,
			row.nutrition ? JSON.stringify(row.nutrition) : null,
		);
	}
	run(
		`INSERT INTO cargo_tag (cargo_id, tag_id) VALUES (?, ?), (?, ?), (?, ?)`,
		ids.cargoMilkId,
		ids.tagDairyId,
		ids.cargoCheddarId,
		ids.tagDairyId,
		ids.cargoCarrotsId,
		ids.tagProduceId,
	);

	const soupNutrition = {
		perServing: SOUP_PER_SERVING,
		coverage: 1,
		attributions: [
			{
				ingredientIndex: 0,
				ingredientName: "red lentils",
				fdcId: null,
				source: "user_override",
				grams: 200,
				contribution: SOUP_PER_SERVING,
			},
		],
		computedAt: now.toISOString(),
		recipeMassG: 800,
	};
	run(
		`INSERT INTO meal (id, organization_id, name, description, directions, servings, domain, type,
		   nutrition, nutrition_revision, nutrition_computed_revision, nutrition_status, nutrition_updated_at, created_at, updated_at)
		 VALUES (?, ?, ?, NULL, ?, 2, 'food', 'recipe', ?, 0, 0, 'current', ?, ?, ?)`,
		ids.mealSoupId,
		ids.organizationId,
		"E2E lentil soup",
		JSON.stringify(["Simmer lentils and carrots for 25 minutes."]),
		JSON.stringify(soupNutrition),
		nowS,
		nowS,
		nowS,
	);
	run(
		`INSERT INTO meal (id, organization_id, name, directions, servings, domain, type, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 4, 'food', 'recipe', ?, ?)`,
		ids.mealPancakesId,
		ids.organizationId,
		"E2E pancakes",
		JSON.stringify(["Whisk, rest, and fry."]),
		nowS,
		nowS,
	);
	const ingredients: Array<
		[mealId: string, name: string, qty: number, unit: string, optional: 0 | 1]
	> = [
		[ids.mealSoupId, "red lentils", 200, "g", 0],
		[ids.mealSoupId, "carrots", 2, "unit", 0],
		[ids.mealPancakesId, "flour", 250, "g", 0],
		[ids.mealPancakesId, "whole milk", 300, "ml", 0],
		[ids.mealPancakesId, "blueberries", 100, "g", 1],
	];
	ingredients.forEach(([mealId, name, qty, unit, optional], index) => {
		run(
			`INSERT INTO meal_ingredient (id, meal_id, ingredient_name, quantity, unit, is_optional, order_index)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			`e2e00000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
			mealId,
			name,
			qty,
			unit,
			optional,
			index,
		);
	});

	run(
		`INSERT INTO meal_plan (id, organization_id, name, is_archived, created_at, updated_at)
		 VALUES (?, ?, 'Meal Plan', 0, ?, ?)`,
		ids.planId,
		ids.organizationId,
		nowS,
		nowS,
	);
	run(
		`INSERT INTO meal_plan_entry (id, plan_id, meal_id, date, slot_type, order_index, created_at, cooked_at, cooked_by_user_id)
		 VALUES (?, ?, ?, ?, 'dinner', 0, ?, ?, ?)`,
		ids.entryCookedId,
		ids.planId,
		ids.mealSoupId,
		today,
		nowS,
		nowS,
		ids.userId,
	);

	await db.batch(statements);
	return { apiKey, today, ids };
}
