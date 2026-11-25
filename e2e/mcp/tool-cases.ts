/**
 * MCP e2e tool cases. Each case is one real `tools/call` against the local
 * worker. The runner (mcp-tools.mcp-e2e.ts) applies the shared checks to
 * every case: ok envelope, text and structured copies agree, no internal ids
 * at any depth, timestamps are ISO strings, and the reply fits `maxBytes`.
 * `check` adds the tool-specific assertions.
 *
 * To cover a new tool, append a case. Cases run in order and can read the
 * data of earlier cases through `ctx.data(caseId)`.
 */

import { expect } from "vitest";
import type { SEED_IDS } from "./seed";

export type CaseContext = {
	ids: typeof SEED_IDS;
	today: string;
	/** `data` from an earlier case's envelope, by case id. */
	data: (caseId: string) => unknown;
	/** Reply size in bytes of an earlier case, by case id. */
	bytes: (caseId: string) => number;
};

export type ToolCase = {
	id: string;
	tool: string;
	args: (ctx: CaseContext) => Record<string, unknown>;
	/**
	 * Size budget for the whole tools/call result (JSON bytes). Set from the
	 * size table the run prints, with about 1.5x headroom.
	 */
	maxBytes: number;
	check?: (data: unknown, ctx: CaseContext, envelope: Envelope) => void;
};

export type Envelope = {
	ok: boolean;
	tool: string;
	data?: unknown;
	meta?: Record<string, unknown>;
	warnings?: string[];
	error?: { code: string; message: string };
};

type Row = Record<string, unknown>;

const rows = (data: unknown): Row[] => data as Row[];
const record = (data: unknown): Row => data as Row;
const names = (data: unknown) => rows(data).map((row) => row.name);

/** Stable per-run UUIDs for idempotency/operation keys. */
const key = (n: number) =>
	`e2e10000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const TOOL_CASES: ToolCase[] = [
	{
		id: "get_context",
		tool: "get_context",
		args: () => ({}),
		maxBytes: 8_000,
		check: (data) => {
			const context = record(data);
			expect(context).not.toHaveProperty("keyPrefix");
			// A readable key name survives; opaque ones are dropped.
			expect(context.keyName).toBe("MCP e2e");
		},
	},
	{
		id: "list_inventory",
		tool: "list_inventory",
		args: () => ({}),
		maxBytes: 5_500,
		check: (data, ctx) => {
			expect(rows(data)).toHaveLength(4);
			const milk = rows(data).find((row) => row.id === ctx.ids.cargoMilkId);
			expect(typeof milk?.expiresAt).toBe("string");
			expect(milk?.nutrition).toBeTruthy();
			expect(milk?.tags).toEqual(["dairy"]);
			const carrots = rows(data).find(
				(row) => row.id === ctx.ids.cargoCarrotsId,
			);
			expect(carrots?.expiresAt).toBeNull();
		},
	},
	{
		id: "list_inventory:nameContains",
		tool: "list_inventory",
		args: () => ({ nameContains: "MILK" }),
		maxBytes: 2_500,
		check: (data) => {
			expect(names(data)).toEqual(["Whole milk"]);
		},
	},
	{
		id: "list_inventory:tag",
		tool: "list_inventory",
		args: () => ({ tag: "dairy" }),
		maxBytes: 3_000,
		check: (data) => {
			expect(names(data).sort()).toEqual(["Mature cheddar", "Whole milk"]);
		},
	},
	{
		id: "list_inventory:no-nutrition",
		tool: "list_inventory",
		args: () => ({ includeNutrition: false }),
		maxBytes: 3_000,
		check: (data, ctx) => {
			expect(rows(data)).toHaveLength(4);
			for (const row of rows(data)) expect(row).not.toHaveProperty("nutrition");
			expect(ctx.bytes("list_inventory:no-nutrition")).toBeLessThan(
				ctx.bytes("list_inventory"),
			);
		},
	},
	{
		id: "list_inventory:expiry-page-1",
		tool: "list_inventory",
		args: () => ({ sortBy: "expiresAt", limit: 1, includeNutrition: false }),
		maxBytes: 1_500,
		check: (data, _ctx, envelope) => {
			expect(names(data)).toEqual(["Whole milk"]);
			expect(typeof envelope.meta?.nextCursor).toBe("string");
		},
	},
	{
		id: "get_cargo_item",
		tool: "get_cargo_item",
		args: (ctx) => ({ itemId: ctx.ids.cargoMilkId }),
		maxBytes: 2_000,
		check: (data) => {
			const item = record(data);
			expect(item.name).toBe("Whole milk");
			expect(typeof item.expiresAt).toBe("string");
		},
	},
	{
		id: "get_expiring_items",
		tool: "get_expiring_items",
		args: () => ({ days: 7 }),
		maxBytes: 1_500,
		check: (data) => {
			expect(JSON.stringify(data)).toContain("Whole milk");
		},
	},
	{
		id: "preview_inventory_import",
		tool: "preview_inventory_import",
		args: (ctx) => ({
			items: [
				{ name: "Rolled oats", quantity: 500, unit: "g" },
				{
					id: ctx.ids.cargoCheddarId,
					name: "Mature cheddar",
					quantity: 400,
					unit: "g",
				},
			],
		}),
		maxBytes: 2_500,
		check: (data) => {
			expect(typeof record(data).previewToken).toBe("string");
		},
	},
	{
		id: "apply_inventory_import",
		tool: "apply_inventory_import",
		args: (ctx) => ({
			previewToken: record(ctx.data("preview_inventory_import")).previewToken,
			idempotencyKey: key(1),
		}),
		maxBytes: 1_500,
		check: (data, ctx) => {
			const result = record(data);
			expect(result.imported).toBe(1);
			expect(result.updated).toBe(1);
			expect(result.createdIds).toHaveLength(1);
			expect(result.updatedIds).toEqual([ctx.ids.cargoCheddarId]);
		},
	},
	{
		id: "get_cargo_item:imported",
		tool: "get_cargo_item",
		args: (ctx) => ({
			itemId: (
				record(ctx.data("apply_inventory_import")).createdIds as string[]
			)[0],
		}),
		maxBytes: 1_000,
		check: (data) => {
			expect(record(data).name).toBe("Rolled oats");
		},
	},
	{
		id: "update_meal",
		tool: "update_meal",
		args: (ctx) => ({
			meal: {
				id: ctx.ids.mealPancakesId,
				name: "E2E pancakes",
				domain: "food",
				servings: 4,
				ingredients: [
					{ ingredientName: "flour", quantity: 250, unit: "g" },
					{ ingredientName: "whole milk", quantity: 300, unit: "ml" },
					{
						ingredientName: "blueberries",
						quantity: 100,
						unit: "g",
						isOptional: true,
					},
				],
				tags: [],
			},
		}),
		maxBytes: 2_500,
		check: (data) => {
			const byName = new Map(
				(record(data).ingredients as Row[]).map((row) => [
					row.ingredientName,
					row.isOptional,
				]),
			);
			expect(byName.get("blueberries")).toBe(true);
			expect(byName.get("flour")).toBe(false);
		},
	},
	{
		id: "list_meals",
		tool: "list_meals",
		args: () => ({}),
		maxBytes: 2_500,
	},
	{
		id: "get_meal",
		tool: "get_meal",
		args: (ctx) => ({ mealId: ctx.ids.mealSoupId }),
		maxBytes: 4_500,
	},
	{
		id: "get_meal_plan",
		tool: "get_meal_plan",
		args: (ctx) => ({ startDate: ctx.today, days: 1 }),
		maxBytes: 2_500,
		check: (data) => {
			expect(JSON.stringify(data)).toContain("E2E lentil soup");
		},
	},
	{
		id: "set_nutrition_goal",
		tool: "set_nutrition_goal",
		args: (ctx) => ({
			dailyEnergyKcal: 2000,
			proteinG: 120,
			effectiveFrom: ctx.today,
			operationKey: key(2),
		}),
		maxBytes: 2_000,
	},
	{
		id: "log_manifest_intake",
		tool: "log_manifest_intake",
		args: (ctx) => ({
			operationKey: key(3),
			portions: [
				{
					entryId: ctx.ids.entryCookedId,
					servings: 1,
					idempotencyKey: key(4),
				},
			],
		}),
		maxBytes: 3_000,
		check: (data, ctx) => {
			const result = record(data);
			expect(result.logged).toBe(1);
			const [item] = result.items as Row[];
			expect(item).toMatchObject({
				entryId: ctx.ids.entryCookedId,
				servings: 1,
				amount: 1,
				unit: "serving",
				energyKcal: 420,
				replayed: false,
			});
			expect(typeof item?.intakeId).toBe("string");
			// The raw intake row is gone.
			expect(item).not.toHaveProperty("intake");
			expect(JSON.stringify(data)).not.toContain("nutrientsJson");
		},
	},
	{
		id: "get_nutrition_summary",
		tool: "get_nutrition_summary",
		args: (ctx) => ({ from: ctx.today, to: ctx.today }),
		maxBytes: 6_000,
		check: (data, ctx) => {
			const summary = record(data);
			expect(summary).not.toHaveProperty("nutritionV2");
			const [day] = summary.days as Row[];
			expect(day?.date).toBe(ctx.today);
			expect(day?.vsGoal).toMatchObject({
				energyKcal: { consumed: 420, target: 2000, remaining: 1580 },
			});
		},
	},
	{
		id: "list_nutrition_intakes",
		tool: "list_nutrition_intakes",
		args: (ctx) => ({ from: ctx.today, to: ctx.today }),
		maxBytes: 2_500,
		check: (data) => {
			expect(record(data).items as Row[]).toHaveLength(1);
		},
	},
	{
		id: "get_kitchen_summary",
		tool: "get_kitchen_summary",
		args: () => ({}),
		maxBytes: 9_000,
	},
	{
		id: "clear_manifest_intake",
		tool: "clear_manifest_intake",
		args: (ctx) => ({
			entryIds: [ctx.ids.entryCookedId],
			confirm: true,
			operationKey: key(5),
		}),
		maxBytes: 2_500,
		check: (data) => {
			expect(record(data).clearedCount).toBe(1);
		},
	},
];
