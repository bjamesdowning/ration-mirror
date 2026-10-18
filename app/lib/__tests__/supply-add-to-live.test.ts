import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { cargo, supplyItem, supplyList } from "~/db/schema";
import {
	completeSupplyList,
	getUnpurchasedSupplyItemIdsToClear,
	updateSupplyItem,
} from "~/lib/supply.server";
import { InvalidListStateError } from "~/lib/supply-list-errors";
import { LIVE_ONLY_CHECK_MESSAGE } from "~/lib/supply-list-kinds";
import {
	applySupplyOperations,
	copyItemsToLive,
	getSavedListView,
	undoAddToLive,
} from "~/lib/supply-lists.server";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

const ORG = "org-supply";
const NOW = new Date("2026-10-18T12:00:00.000Z");

function schemaSql() {
	return `
		create table supply_list (
			id text primary key,
			organization_id text not null,
			name text not null default 'Shopping List',
			share_token text,
			share_expires_at integer,
			kind text not null default 'saved',
			archived_at integer,
			created_from text not null default 'manual',
			source_list_id text,
			source_reference text,
			store_profile_id text,
			revision integer not null default 0,
			quota_slot integer,
			created_at integer not null default 0,
			updated_at integer not null default 0
		);
		create table supply_item (
			id text primary key,
			list_id text not null,
			name text not null,
			quantity real not null default 1,
			unit text not null default 'unit',
			base_quantity real not null default 1,
			base_unit text not null default 'unit',
			domain text not null default 'food',
			is_purchased integer not null default 0,
			source_meal_id text,
			source_meal_ids text not null default '[]',
			source_origins text not null default '[]',
			source_cargo_id text,
			note text,
			category text,
			sort_order integer not null default 0,
			created_at integer not null default 0,
			updated_at integer not null default 0
		);
		create table cargo (
			id text primary key,
			organization_id text not null,
			name text not null,
			quantity real not null,
			unit text not null,
			base_quantity real not null default 1,
			base_unit text not null default 'unit',
			domain text not null default 'food',
			status text not null default 'stable',
			expires_at integer,
			nutrition text,
			created_at integer not null default 0,
			updated_at integer not null default 0
		);
		create table kitchen_event (
			id text primary key,
			organization_id text not null,
			user_id text,
			event_type text not null,
			occurred_at integer not null,
			meal_id text,
			cargo_id text,
			subject_name text not null,
			payload text not null default '{}'
		);
		create table supply_operation (
			id text primary key,
			organization_id text not null,
			list_id text,
			operation_id text not null,
			operation_type text not null,
			applied_at integer not null default 0,
			result_json text
		);
		create table meal (
			id text primary key,
			name text not null
		);
	`;
}

function envFor(db: D1Database): Env {
	return { DB: db } as Env;
}

async function seedLists(db: D1Database) {
	const d1 = drizzle(db);
	const liveId = crypto.randomUUID();
	const savedId = crypto.randomUUID();
	const now = NOW;
	await d1.insert(supplyList).values([
		{
			id: liveId,
			organizationId: ORG,
			name: "Supply",
			kind: "live",
			createdFrom: "manual",
			revision: 1,
			quotaSlot: 1,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: savedId,
			organizationId: ORG,
			name: "Staples",
			kind: "saved",
			createdFrom: "manual",
			revision: 1,
			quotaSlot: 2,
			createdAt: now,
			updatedAt: now,
		},
	]);
	return { liveId, savedId, d1 };
}

async function insertItem(
	d1: ReturnType<typeof drizzle>,
	listId: string,
	input: {
		name: string;
		quantity?: number;
		isPurchased?: boolean;
		origins?: Array<"manual" | "manifest" | "galley" | "cargo">;
		mealIds?: string[];
	},
) {
	const id = crypto.randomUUID();
	const quantity = input.quantity ?? 1;
	await d1.insert(supplyItem).values({
		id,
		listId,
		name: input.name,
		quantity,
		unit: "unit",
		baseQuantity: quantity,
		baseUnit: "unit",
		domain: "food",
		isPurchased: input.isPurchased ?? false,
		sourceMealIds: input.mealIds ?? [],
		sourceOrigins: input.origins ?? ["manual"],
		note: "keep",
		category: "dairy",
		sortOrder: 0,
		createdAt: NOW,
		updatedAt: NOW,
	});
	return id;
}

describe("copyItemsToLive", () => {
	let db: D1Database;
	let liveId: string;
	let savedId: string;
	let d1: ReturnType<typeof drizzle>;

	beforeEach(async () => {
		const sqlite = createSqliteD1();
		db = sqlite.database;
		sqlite.sqlite.exec(schemaSql());
		const seeded = await seedLists(db);
		liveId = seeded.liveId;
		savedId = seeded.savedId;
		d1 = seeded.d1;
	});

	it("inserts a manual-only Live row and keeps it through sync clearing", async () => {
		const sourceId = await insertItem(d1, savedId, {
			name: "Milk",
			quantity: 2,
		});
		const copied = await copyItemsToLive({
			env: envFor(db),
			organizationId: ORG,
			sourceListId: savedId,
			mode: "add_all",
			itemIds: [sourceId],
		});
		expect(copied.result.counts.added).toBe(1);
		const liveItemId = copied.result.added[0]?.liveItemId;
		expect(liveItemId).toBeTruthy();
		const [row] = await d1
			.select()
			.from(supplyItem)
			.where(eq(supplyItem.id, liveItemId ?? ""));
		expect(row?.sourceOrigins).toEqual(["manual"]);
		expect(row?.sourceMealIds).toEqual([]);
		expect(row?.sourceCargoId).toBeNull();
		expect(row?.sourceMealId).toBeNull();
		expect(row?.isPurchased).toBe(false);
		expect(row?.note).toBe("keep");
		expect(row?.quantity).toBe(2);

		const clearIds = await getUnpurchasedSupplyItemIdsToClear(d1, liveId);
		expect(clearIds).not.toContain(liveItemId);
	});

	it("skips items already on Live or in the cart", async () => {
		await insertItem(d1, liveId, { name: "Milk", quantity: 1 });
		await insertItem(d1, liveId, {
			name: "Eggs",
			quantity: 6,
			isPurchased: true,
		});
		const milk = await insertItem(d1, savedId, { name: "Milk", quantity: 2 });
		const eggs = await insertItem(d1, savedId, { name: "Eggs", quantity: 6 });
		const copied = await copyItemsToLive({
			env: envFor(db),
			organizationId: ORG,
			sourceListId: savedId,
			mode: "add_all",
			itemIds: [milk, eggs],
		});
		expect(copied.result.counts).toMatchObject({
			added: 0,
			merged: 0,
			skippedOnLive: 1,
			skippedInCart: 1,
		});
		const liveRows = await d1
			.select()
			.from(supplyItem)
			.where(eq(supplyItem.listId, liveId));
		expect(liveRows).toHaveLength(2);
		expect(liveRows.find((row) => row.name === "Milk")?.quantity).toBe(1);
	});

	it("add_more sums a manual Live row and inserts beside a generated row", async () => {
		const manualId = await insertItem(d1, liveId, {
			name: "Milk",
			quantity: 1,
		});
		await insertItem(d1, liveId, {
			name: "Bread",
			quantity: 1,
			origins: ["manifest"],
			mealIds: ["meal-1"],
		});
		const milk = await insertItem(d1, savedId, { name: "Milk", quantity: 2 });
		const bread = await insertItem(d1, savedId, { name: "Bread", quantity: 1 });
		const copied = await copyItemsToLive({
			env: envFor(db),
			organizationId: ORG,
			sourceListId: savedId,
			mode: "add_all",
			onExisting: "add_more",
			itemIds: [milk, bread],
		});
		expect(copied.result.counts.merged).toBe(1);
		expect(copied.result.counts.added).toBe(1);
		expect(copied.result.merged[0]).toMatchObject({
			liveItemId: manualId,
			prevQuantity: 1,
			quantity: 3,
		});
		const rows = await d1
			.select()
			.from(supplyItem)
			.where(eq(supplyItem.listId, liveId));
		const breadRows = rows.filter((row) => row.name === "Bread");
		expect(breadRows).toHaveLength(2);
		const generated = breadRows.find((row) =>
			(row.sourceOrigins ?? []).includes("manifest"),
		);
		const manual = breadRows.find((row) =>
			(row.sourceOrigins ?? []).includes("manual"),
		);
		expect(generated?.quantity).toBe(1);
		expect(manual?.sourceMealIds).toEqual([]);
		expect(manual?.isPurchased).toBe(false);
	});

	it("skips cargo on add-missing and ignores cargo on add-all", async () => {
		await insertItem(d1, savedId, { name: "Rice", quantity: 1 });
		await d1.insert(cargo).values({
			id: crypto.randomUUID(),
			organizationId: ORG,
			name: "Rice",
			quantity: 2,
			unit: "unit",
			baseQuantity: 2,
			baseUnit: "unit",
			domain: "food",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const missing = await copyItemsToLive({
			env: envFor(db),
			organizationId: ORG,
			sourceListId: savedId,
			mode: "missing_only",
		});
		expect(missing.result.counts.skippedInCargo).toBe(1);
		expect(missing.result.counts.added).toBe(0);

		const all = await copyItemsToLive({
			env: envFor(db),
			organizationId: ORG,
			sourceListId: savedId,
			mode: "add_all",
		});
		expect(all.result.counts.added).toBe(1);
	});

	it("undo removes inserted unpurchased rows and restores bumped quantities", async () => {
		const manualId = await insertItem(d1, liveId, {
			name: "Milk",
			quantity: 1,
		});
		const milk = await insertItem(d1, savedId, { name: "Milk", quantity: 2 });
		const oats = await insertItem(d1, savedId, { name: "Oats", quantity: 1 });
		const copied = await copyItemsToLive({
			env: envFor(db),
			organizationId: ORG,
			sourceListId: savedId,
			mode: "add_all",
			onExisting: "add_more",
			itemIds: [milk, oats],
		});
		const undone = await undoAddToLive({
			env: envFor(db),
			organizationId: ORG,
			sourceListId: savedId,
			added: copied.result.added,
			merged: copied.result.merged,
		});
		expect(undone.undone).toEqual({ deleted: 1, restored: 1 });
		const rows = await d1
			.select()
			.from(supplyItem)
			.where(eq(supplyItem.listId, liveId));
		expect(rows.map((row) => row.name)).toEqual(["Milk"]);
		expect(rows[0]?.id).toBe(manualId);
		expect(rows[0]?.quantity).toBe(1);
	});

	it("does not undo a row that was checked off after the add", async () => {
		const oats = await insertItem(d1, savedId, { name: "Oats", quantity: 1 });
		const copied = await copyItemsToLive({
			env: envFor(db),
			organizationId: ORG,
			sourceListId: savedId,
			mode: "add_all",
			itemIds: [oats],
		});
		const liveItemId = copied.result.added[0]?.liveItemId ?? "";
		await d1
			.update(supplyItem)
			.set({ isPurchased: true })
			.where(eq(supplyItem.id, liveItemId));
		const undone = await undoAddToLive({
			env: envFor(db),
			organizationId: ORG,
			sourceListId: savedId,
			added: copied.result.added,
			merged: [],
		});
		expect(undone.undone.deleted).toBe(0);
		const [row] = await d1
			.select()
			.from(supplyItem)
			.where(eq(supplyItem.id, liveItemId));
		expect(row?.isPurchased).toBe(true);
	});
});

describe("saved list status", () => {
	it("reports on Live, in cart, cargo, and last bought", async () => {
		const { database, sqlite } = createSqliteD1();
		sqlite.exec(schemaSql());
		const { liveId, savedId, d1 } = await seedLists(database);
		await insertItem(d1, liveId, { name: "Milk", quantity: 2 });
		await insertItem(d1, liveId, {
			name: "Eggs",
			isPurchased: true,
			quantity: 6,
		});
		await insertItem(d1, savedId, { name: "Milk", quantity: 1 });
		await insertItem(d1, savedId, { name: "Eggs", quantity: 6 });
		await insertItem(d1, savedId, { name: "Rice", quantity: 1 });
		await d1.insert(cargo).values({
			id: crypto.randomUUID(),
			organizationId: ORG,
			name: "Rice",
			quantity: 2,
			unit: "unit",
			baseQuantity: 2,
			baseUnit: "unit",
			domain: "food",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const recent = Math.floor(
			new Date("2026-10-01T00:00:00.000Z").getTime() / 1000,
		);
		const stale = Math.floor(
			new Date("2024-01-01T00:00:00.000Z").getTime() / 1000,
		);
		sqlite.exec(`
			insert into kitchen_event (id, organization_id, event_type, occurred_at, subject_name, payload)
			values
				('e1', '${ORG}', 'supply_docked', ${recent}, 'Milk', '{}'),
				('e2', '${ORG}', 'supply_docked', ${stale}, 'Rice', '{}'),
				('e3', '${ORG}', 'supply_docked', ${recent}, 'Almond milk', '{}');
		`);
		const view = await getSavedListView(envFor(database), ORG, savedId, NOW);
		const byName = new Map(view?.items.map((item) => [item.name, item]));
		expect(byName.get("Milk")?.live).toMatchObject({
			state: "on_live",
			quantity: 2,
			manualOnly: true,
		});
		expect(byName.get("Milk")?.lastDockedAt).toBe("2026-10-01T00:00:00.000Z");
		expect(byName.get("Eggs")?.live.state).toBe("in_cart");
		expect(byName.get("Rice")?.live.state).toBe("none");
		expect(byName.get("Rice")?.inCargo).toBe(2);
		expect(byName.get("Rice")?.lastDockedAt).toBeNull();
	});
});

describe("only Live can be checked or docked", () => {
	let db: D1Database;
	let savedId: string;
	let itemId: string;

	beforeEach(async () => {
		const sqlite = createSqliteD1();
		db = sqlite.database;
		sqlite.sqlite.exec(schemaSql());
		const seeded = await seedLists(db);
		savedId = seeded.savedId;
		itemId = await insertItem(seeded.d1, savedId, { name: "Milk" });
	});

	it("refuses to dock a saved list", async () => {
		await expect(
			completeSupplyList(envFor(db), ORG, savedId),
		).rejects.toBeInstanceOf(InvalidListStateError);
	});

	it("refuses purchased toggles on a saved list and still allows quantity edits", async () => {
		await expect(
			updateSupplyItem(db, ORG, savedId, itemId, { isPurchased: true }),
		).rejects.toMatchObject({ message: LIVE_ONLY_CHECK_MESSAGE });
		const updated = await updateSupplyItem(db, ORG, savedId, itemId, {
			quantity: 4,
		});
		expect(updated?.quantity).toBe(4);
		expect(updated?.isPurchased).toBe(false);
	});

	it("refuses offline purchased operations on a saved list", async () => {
		await expect(
			applySupplyOperations({
				env: envFor(db),
				organizationId: ORG,
				listId: savedId,
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
		).rejects.toMatchObject({ message: LIVE_ONLY_CHECK_MESSAGE });
		await expect(
			applySupplyOperations({
				env: envFor(db),
				organizationId: ORG,
				listId: savedId,
				baseRevision: 1,
				operations: [
					{
						operationId: crypto.randomUUID(),
						type: "reset_purchased",
					},
				],
			}),
		).rejects.toMatchObject({ message: LIVE_ONLY_CHECK_MESSAGE });
	});
});
