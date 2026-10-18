import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supplyItem, supplyList } from "~/db/schema";
import {
	LIVE_ONLY_CHECK_MESSAGE,
	LIVE_ONLY_DOCK_MESSAGE,
} from "~/lib/supply-list-kinds";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

vi.mock("~/lib/auth.server", () => ({
	requireActiveGroup: vi.fn(async () => ({
		groupId: "org-supply",
		session: { user: { id: "user-1" } },
	})),
	getUserSettings: vi.fn(async () => null),
}));

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: vi.fn(async () => ({
		userId: "user-1",
		organizationId: "org-supply",
	})),
}));

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: vi.fn(async () => ({ allowed: true })),
	};
});

const ORG = "org-supply";

function schemaSql() {
	return `
		create table supply_list (
			id text primary key,
			organization_id text not null,
			name text not null,
			share_token text,
			share_expires_at integer,
			kind text not null,
			archived_at integer,
			created_from text not null,
			source_list_id text,
			source_reference text,
			store_profile_id text,
			revision integer not null default 0,
			quota_slot integer,
			created_at integer not null,
			updated_at integer not null
		);
		create table supply_item (
			id text primary key,
			list_id text not null,
			name text not null,
			quantity real not null,
			unit text not null,
			base_quantity real not null,
			base_unit text not null,
			domain text not null,
			is_purchased integer not null default 0,
			source_meal_id text,
			source_meal_ids text not null default '[]',
			source_origins text not null default '[]',
			source_cargo_id text,
			note text,
			category text,
			sort_order integer not null default 0,
			created_at integer not null,
			updated_at integer not null
		);
		create table supply_operation (
			id text primary key,
			organization_id text not null,
			list_id text,
			operation_id text not null,
			operation_type text not null,
			applied_at integer not null,
			result_json text
		);
		create table meal (id text primary key, name text not null);
	`;
}

function statusOf(result: unknown): number | undefined {
	if (!result || typeof result !== "object") return undefined;
	const record = result as {
		init?: { status?: number };
		status?: number;
		data?: { error?: string };
	};
	return record.init?.status ?? record.status;
}

function errorOf(result: unknown): string | undefined {
	if (!result || typeof result !== "object") return undefined;
	const record = result as { data?: { error?: string }; error?: string };
	return record.data?.error ?? record.error;
}

describe("saved lists cannot be shopped over HTTP", () => {
	let db: D1Database;
	let savedId: string;
	let itemId: string;

	beforeEach(async () => {
		const sqlite = createSqliteD1();
		db = sqlite.database;
		sqlite.sqlite.exec(schemaSql());
		const d1 = drizzle(db);
		const now = new Date("2026-10-18T12:00:00.000Z");
		savedId = crypto.randomUUID();
		itemId = crypto.randomUUID();
		await d1.insert(supplyList).values([
			{
				id: crypto.randomUUID(),
				organizationId: ORG,
				name: "Supply",
				kind: "live",
				createdFrom: "manual",
				revision: 1,
				createdAt: now,
				updatedAt: now,
			},
			{
				id: savedId,
				organizationId: ORG,
				name: "Staples",
				kind: "saved",
				createdFrom: "manual",
				shareToken: "saved-token",
				revision: 1,
				createdAt: now,
				updatedAt: now,
			},
		]);
		await d1.insert(supplyItem).values({
			id: itemId,
			listId: savedId,
			name: "Milk",
			quantity: 1,
			unit: "unit",
			baseQuantity: 1,
			baseUnit: "unit",
			domain: "food",
			isPurchased: false,
			sourceMealIds: [],
			sourceOrigins: ["manual"],
			createdAt: now,
			updatedAt: now,
		});
	});

	function ctx() {
		return {
			cloudflare: {
				env: {
					DB: db,
					RATION_KV: {},
					FEATURE_FLAG_OVERRIDES: JSON.stringify({
						"supply-multi-lists": true,
					}),
				},
			},
		} as never;
	}

	it("rejects web complete on a saved list", async () => {
		const { action } = await import("~/routes/api/supply-lists.$id.complete");
		const result = await action({
			request: new Request(
				"https://ration.mayutic.com/api/supply-lists/x/complete",
				{
					method: "POST",
				},
			),
			context: ctx(),
			params: { id: savedId },
		} as never);
		expect(statusOf(result)).toBe(409);
		expect(errorOf(result)).toBe(LIVE_ONLY_DOCK_MESSAGE);
	});

	it("rejects mobile complete on a saved list", async () => {
		const { action } = await import(
			"~/routes/api/mobile/v1.supply.lists.$listId.complete"
		);
		const result = await action({
			request: new Request(
				"https://ration.mayutic.com/api/mobile/v1/supply/lists/x/complete",
				{ method: "POST" },
			),
			context: ctx(),
			params: { listId: savedId },
		} as never);
		expect(statusOf(result)).toBe(409);
		expect(errorOf(result)).toBe(LIVE_ONLY_DOCK_MESSAGE);
	});

	it("rejects PUT isPurchased on a saved list", async () => {
		const { action } = await import(
			"~/routes/api/supply-lists.$id.items.$itemId"
		);
		const result = await action({
			request: new Request(
				"https://ration.mayutic.com/api/supply-lists/x/items/y",
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ isPurchased: true }),
				},
			),
			context: ctx(),
			params: { id: savedId, itemId },
		} as never);
		expect(statusOf(result)).toBe(409);
		expect(errorOf(result)).toBe(LIVE_ONLY_CHECK_MESSAGE);
	});

	it("rejects offline toggle_purchased on a saved list", async () => {
		const { action } = await import("~/routes/api/supply-lists.$id.operations");
		const result = await action({
			request: new Request(
				"https://ration.mayutic.com/api/supply-lists/x/operations",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						baseRevision: 1,
						operations: [
							{
								operationId: crypto.randomUUID(),
								type: "toggle_purchased",
								itemId,
								payload: { isPurchased: true },
							},
						],
					}),
				},
			),
			context: ctx(),
			params: { id: savedId },
		} as never);
		expect(statusOf(result)).toBe(409);
		expect(errorOf(result)).toBe(LIVE_ONLY_CHECK_MESSAGE);
	});

	it("rejects a shared saved-list purchased toggle", async () => {
		const { action } = await import("~/routes/api/shared.$token.items.$itemId");
		const result = await action({
			request: new Request(
				"https://ration.mayutic.com/api/shared/saved-token/items/y",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ isPurchased: true }),
				},
			),
			context: ctx(),
			params: { token: "saved-token", itemId },
		} as never);
		expect(statusOf(result)).toBe(409);
		expect(errorOf(result)).toContain("Only Live Supply");
	});

	it("rejects MCP complete_supply_list for a saved list", async () => {
		const { createSupplyToolDefs } = await import("~/lib/mcp/tools/supply");
		const tools = createSupplyToolDefs({
			DB: db,
			FEATURE_FLAG_OVERRIDES: JSON.stringify({ "supply-multi-lists": true }),
		} as never);
		const complete = tools.find((tool) => tool.name === "complete_supply_list");
		await expect(
			complete?.handler({ organizationId: ORG, userId: "user-1" } as never, {
				confirm: true,
				listId: savedId,
			}),
		).rejects.toMatchObject({ message: LIVE_ONLY_DOCK_MESSAGE });
	});
});
