/**
 * #11: update_diary_food can move a Fuel entry to another day, and the Fuel
 * errors map to agent-readable envelopes instead of internal_error.
 * The shared move itself is covered against SQLite in
 * nutrition/__tests__/diary-fuel-move.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiaryFoodNotFoundError } from "~/lib/nutrition/diary.server";
import {
	FuelDailyLimitError,
	FuelDateImmutableError,
	FuelTimezoneRequiredError,
} from "~/lib/nutrition/fuel-errors";
import type { McpToolContext } from "../auth";
import { mapErrorToEnvelope } from "../envelope";
import type { McpToolsEnv } from "../tool-runtime";
import { createDiaryToolDefs, pinFuelDayClock } from "../tools/diary";

const updateDiaryFood = vi.hoisted(() => vi.fn());
const logDiaryFood = vi.hoisted(() => vi.fn());
const requireFuelTimeZone = vi.hoisted(() => vi.fn());

vi.mock("~/lib/nutrition/diary.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/nutrition/diary.server")>();
	return {
		...actual,
		updateDiaryFood: (...args: unknown[]) => updateDiaryFood(...args),
		logDiaryFood: (...args: unknown[]) => logDiaryFood(...args),
	};
});

vi.mock("~/lib/nutrition/fuel-cap.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/nutrition/fuel-cap.server")>();
	return {
		...actual,
		requireFuelTimeZone: (...args: unknown[]) => requireFuelTimeZone(...args),
	};
});

const mcp = {
	organizationId: "org-1",
	userId: "user-a",
	apiKeyId: "key-1",
	keyName: "Test",
	keyPrefix: "ration_test",
	scopes: ["mcp:nutrition:read", "mcp:nutrition:write"],
	authMethod: "api_key",
	agentSurface: "mcp",
} as McpToolContext;

const env = {
	RATION_ENV: "test",
	FLAGS: { getBooleanValue: async () => true },
	__mcp: mcp,
} as unknown as McpToolsEnv & { __mcp: McpToolContext };

const INTAKE = "44444444-4444-4444-8444-444444444444";
const NEXT = "55555555-5555-4555-8555-555555555555";

const typed = {
	intakeId: INTAKE,
	name: "Porridge",
	energyKcal: 300,
	proteinG: 10,
	carbsG: 50,
	fatG: 6,
	idempotencyKey: "22222222-2222-4222-8222-222222222222",
	operationKey: "33333333-3333-4333-8333-333333333333",
};

function updateTool() {
	const tool = createDiaryToolDefs(env).find(
		(def) => def.name === "update_diary_food",
	);
	if (!tool) throw new Error("missing update_diary_food");
	return tool;
}

describe("update_diary_food date move (#11)", () => {
	beforeEach(() => {
		updateDiaryFood.mockReset();
		logDiaryFood.mockReset();
		requireFuelTimeZone.mockReset();
		requireFuelTimeZone.mockResolvedValue("Europe/Dublin");
		updateDiaryFood.mockResolvedValue({
			operationId: "op-1",
			intakeId: NEXT,
			replayed: false,
			credits: 0,
			kitchenOffer: { cargo: true, galley: true },
			manifestDate: "2026-11-24",
			entryId: null,
		});
	});

	it("advertises fuelDate and fuelTimeZone on the write tools", () => {
		const defs = createDiaryToolDefs(env);
		for (const name of ["log_diary_food", "update_diary_food"]) {
			const shape = defs.find((def) => def.name === name)?.inputSchema.shape;
			expect(shape).toHaveProperty("fuelDate");
			expect(shape).toHaveProperty("fuelTimeZone");
		}
		expect(updateTool().description).toContain("previousIntakeId");
	});

	it("passes fuelDate through, pinned to local noon, and returns both ids", async () => {
		const result = await updateTool().handler(env.__mcp, {
			...typed,
			fuelDate: "2026-11-24",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data).toMatchObject({
			intakeId: NEXT,
			previousIntakeId: INTAKE,
			fuelDate: "2026-11-24",
		});
		expect(result.outcome).toBe("committed");
		const [, principal, , intakeId, write] =
			updateDiaryFood.mock.calls[0] ?? [];
		// The service scopes the row to this person; the tool never widens it.
		expect(principal).toMatchObject({
			userId: "user-a",
			organizationId: "org-1",
		});
		expect(intakeId).toBe(INTAKE);
		expect(write).toMatchObject({
			fuelDate: "2026-11-24",
			occurredAt: "2026-11-24T12:00:00.000Z",
		});
		expect(requireFuelTimeZone).toHaveBeenCalledWith(undefined, "user-a");
	});

	it("uses the zone the caller sends without reading or writing settings", async () => {
		await updateTool().handler(env.__mcp, {
			...typed,
			fuelDate: "2026-07-01",
			fuelTimeZone: "America/New_York",
		});
		const write = updateDiaryFood.mock.calls[0]?.[4];
		expect(write).toMatchObject({
			fuelTimeZone: "America/New_York",
			occurredAt: "2026-07-01T16:00:00.000Z",
		});
		expect(requireFuelTimeZone).not.toHaveBeenCalled();
	});

	it("keeps an explicit occurredAt", async () => {
		await updateTool().handler(env.__mcp, {
			...typed,
			fuelDate: "2026-11-24",
			occurredAt: "2026-11-24T08:30:00.000Z",
		});
		expect(updateDiaryFood.mock.calls[0]?.[4]?.occurredAt).toBe(
			"2026-11-24T08:30:00.000Z",
		);
	});

	it("replays with the same ids", async () => {
		updateDiaryFood.mockResolvedValue({
			operationId: "op-1",
			intakeId: NEXT,
			replayed: true,
			credits: 0,
			kitchenOffer: { cargo: true, galley: true },
			manifestDate: "2026-11-24",
			entryId: null,
		});
		const args = { ...typed, fuelDate: "2026-11-24" };
		const first = await updateTool().handler(env.__mcp, args);
		const second = await updateTool().handler(env.__mcp, args);
		expect(first.ok && second.ok).toBe(true);
		if (!first.ok || !second.ok) return;
		expect(second.data).toEqual(first.data);
		expect(second.outcome).toBe("replayed");
		// Same request, same pinned clock: the service hashes it the same way.
		expect(updateDiaryFood.mock.calls[1]?.[4]).toEqual(
			updateDiaryFood.mock.calls[0]?.[4],
		);
	});

	it("rejects a day that does not exist before writing", async () => {
		const result = await updateTool().handler(env.__mcp, {
			...typed,
			fuelDate: "2026-02-31",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid_input");
		expect(updateDiaryFood).not.toHaveBeenCalled();
	});

	it("rejects a time zone that is not IANA before writing", async () => {
		const result = await updateTool().handler(env.__mcp, {
			...typed,
			fuelDate: "2026-11-24",
			fuelTimeZone: "GMT+1",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid_input");
		expect(updateDiaryFood).not.toHaveBeenCalled();
	});

	it("log_diary_food pins a chosen day the same way", async () => {
		logDiaryFood.mockResolvedValue({
			operationId: "op-2",
			intakeId: NEXT,
			replayed: false,
			credits: 0,
			kitchenOffer: { cargo: true, galley: true },
			manifestDate: "2026-11-20",
			entryId: null,
		});
		const log = createDiaryToolDefs(env).find(
			(def) => def.name === "log_diary_food",
		);
		const { intakeId: _intakeId, ...food } = typed;
		await log?.handler(env.__mcp, { ...food, fuelDate: "2026-11-20" });
		expect(logDiaryFood.mock.calls[0]?.[3]).toMatchObject({
			fuelDate: "2026-11-20",
			occurredAt: "2026-11-20T12:00:00.000Z",
		});
	});
});

describe("pinFuelDayClock", () => {
	const write = {
		name: "Porridge",
		idempotencyKey: typed.idempotencyKey,
		operationKey: typed.operationKey,
	};

	it("leaves a write without fuelDate alone", async () => {
		expect(await pinFuelDayClock(env, "user-a", {}, write)).toBe(write);
	});

	it("does nothing while the Fuel page is off", async () => {
		const off = {
			...env,
			FLAGS: { getBooleanValue: async () => false },
		} as unknown as McpToolsEnv;
		const pinned = await pinFuelDayClock(
			off,
			"user-a",
			{},
			{
				...write,
				fuelDate: "2026-11-24",
			},
		);
		expect(pinned.occurredAt).toBeUndefined();
	});
});

describe("Fuel errors map to agent envelopes", () => {
	it("a day change without fuelDate is invalid_input with a move hint", () => {
		const envelope = mapErrorToEnvelope(
			"update_diary_food",
			new FuelDateImmutableError(),
		);
		expect(envelope.ok).toBe(false);
		if (envelope.ok) return;
		expect(envelope.error.code).toBe("invalid_input");
		expect(envelope.error.details).toEqual({ code: "fuel_date_immutable" });
		expect(envelope.error.recoveryHint).toContain("fuelDate");
	});

	it("a missing zone is invalid_input asking for fuelTimeZone", () => {
		const envelope = mapErrorToEnvelope(
			"update_diary_food",
			new FuelTimezoneRequiredError(),
		);
		if (envelope.ok) throw new Error("expected error");
		expect(envelope.error.code).toBe("invalid_input");
		expect(envelope.error.recoveryHint).toContain("fuelTimeZone");
	});

	it("a full free day is conflict with the upgrade path", () => {
		const envelope = mapErrorToEnvelope(
			"update_diary_food",
			new FuelDailyLimitError(3, "2026-11-23"),
		);
		if (envelope.ok) throw new Error("expected error");
		expect(envelope.error.code).toBe("conflict");
		expect(envelope.error.details).toEqual({
			code: "fuel_daily_limit",
			upgradeRequired: true,
			limit: 3,
			fuelDate: "2026-11-23",
		});
		expect(envelope.error.recoveryHint).toContain("get_billing_summary");
	});

	it("an unknown or replaced intake is not_found with the new-id hint", () => {
		const envelope = mapErrorToEnvelope(
			"update_diary_food",
			new DiaryFoodNotFoundError(),
		);
		if (envelope.ok) throw new Error("expected error");
		expect(envelope.error.code).toBe("not_found");
		expect(envelope.error.recoveryHint).toContain("new one");
	});

	it("a 400 invalid_request from the service is invalid_input", () => {
		const envelope = mapErrorToEnvelope(
			"log_diary_food",
			Object.assign(new Error("fuelDate must be a real day"), {
				code: "invalid_request",
				status: 400,
			}),
		);
		if (envelope.ok) throw new Error("expected error");
		expect(envelope.error.code).toBe("invalid_input");
	});
});
