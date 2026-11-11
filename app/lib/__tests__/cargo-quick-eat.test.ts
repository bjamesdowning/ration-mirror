import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	QuickEatValidationError,
	quickEatFromCargo,
} from "~/lib/cargo-quick-eat.server";
import { isFeatureEnabled } from "~/lib/feature-flags/flags.server";
import { FuelTimezoneRequiredError } from "~/lib/nutrition/fuel-errors";
import { createMockEnv } from "~/test/helpers/mock-env";
import { createSqliteD1 } from "~/test/helpers/sqlite-d1";

const ensureProvisionFromCargo = vi.fn();
const cookMealFromGalley = vi.fn();
const logManifestIntakes = vi.fn();

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

vi.mock("~/lib/feature-flags/assert-enabled.server", () => ({
	assertFeatureEnabled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/feature-flags/flags.server", () => ({
	isFeatureEnabled: vi.fn(async (_env: unknown, flag: string) => {
		return flag !== "nutrition-fuel-page";
	}),
}));

vi.mock("~/lib/meals.server", () => ({
	ensureProvisionFromCargo: (...args: unknown[]) =>
		ensureProvisionFromCargo(...args),
}));

vi.mock("~/lib/galley-cook-manifest.server", () => ({
	cookMealFromGalley: (...args: unknown[]) => cookMealFromGalley(...args),
}));

vi.mock("~/lib/nutrition/service.server", async () => {
	const actual = await vi.importActual<
		typeof import("~/lib/nutrition/service.server")
	>("~/lib/nutrition/service.server");
	return {
		...actual,
		logManifestIntakes: (...args: unknown[]) => logManifestIntakes(...args),
	};
});

vi.mock("~/lib/nutrition/persist.server", () => ({
	recomputeAndStoreMealNutrition: vi.fn().mockResolvedValue(undefined),
}));

const cargoRow = {
	id: "cargo-1",
	organizationId: "org-1",
	name: "Almonds",
	quantity: 10,
	unit: "unit",
};

vi.mock("drizzle-orm/d1", () => {
	function makeChain(result: unknown[]) {
		const chain: {
			from: ReturnType<typeof vi.fn>;
			where: ReturnType<typeof vi.fn>;
			limit: ReturnType<typeof vi.fn>;
			then: (onFulfilled: (v: unknown) => unknown) => Promise<unknown>;
		} = {
			from: vi.fn(),
			where: vi.fn(),
			limit: vi.fn(async () => result),
			// biome-ignore lint/suspicious/noThenProperty: drizzle query chain is awaitable
			then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
		};
		chain.from.mockReturnValue(chain);
		chain.where.mockReturnValue(chain);
		return chain;
	}
	return {
		drizzle: vi.fn(() => ({
			select: vi.fn(() => makeChain([cargoRow])),
		})),
	};
});

const principal = {
	userId: "user-1",
	organizationId: "org-1",
	surface: "mobile" as const,
	authMethod: "mobile_bearer" as const,
	scopes: ["nutrition:write" as const],
};

const OPERATION_KEY = "11111111-1111-4111-8111-111111111111";

describe("quickEatFromCargo", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureProvisionFromCargo.mockResolvedValue({
			provision: {
				id: "meal-1",
				ingredients: [{ quantity: 1, unit: "unit" }],
			},
			alreadyExisted: false,
			normalized: false,
		});
		cookMealFromGalley.mockResolvedValue({
			cooked: true,
			offerPersonalLog: true,
			planId: "plan-1",
			entry: {
				id: "entry-1",
				date: "2026-08-11",
				slotType: "snack",
				cookedAt: "2026-08-11T12:00:00.000Z",
			},
		});
		logManifestIntakes.mockResolvedValue({
			items: [],
			operationId: "op-1",
			replayed: false,
		});
	});

	it("rejects non-positive quantity before DB work", async () => {
		const env = createMockEnv();
		await expect(
			quickEatFromCargo(
				env,
				"org-1",
				principal,
				{ userId: "user-1" } as never,
				{
					cargoId: "cargo-1",
					quantity: 0,
					date: "2026-08-11",
					operationKey: OPERATION_KEY,
				},
			),
		).rejects.toBeInstanceOf(QuickEatValidationError);
		expect(logManifestIntakes).not.toHaveBeenCalled();
	});

	it("passes deterministic UUID intake keys to logManifestIntakes", async () => {
		const env = createMockEnv();
		const input = {
			cargoId: "cargo-1",
			quantity: 1,
			unit: "unit",
			date: "2026-08-11",
			operationKey: OPERATION_KEY,
			logIntake: true,
		};

		const first = await quickEatFromCargo(
			env,
			"org-1",
			principal,
			{ userId: "user-1" } as never,
			input,
		);
		expect(first.intakeLogged).toBe(true);

		expect(logManifestIntakes).toHaveBeenCalledTimes(1);
		const firstCall = logManifestIntakes.mock.calls[0]?.[3] as {
			operationKey: string;
			fuelTimeZone?: string;
			items: Array<{ idempotencyKey: string }>;
		};
		expect(firstCall.operationKey).toMatch(UUID_RE);
		expect(firstCall.items[0]?.idempotencyKey).toMatch(UUID_RE);
		// Must not use the broken suffix form that fails assertOperationKey.
		expect(firstCall.operationKey).not.toContain(":intake");
		expect(firstCall.items[0]?.idempotencyKey).not.toContain(":intake-item");

		const { deriveNutritionOperationKey } = await import(
			"~/lib/nutrition/service.server"
		);
		const expectedOp = await deriveNutritionOperationKey([
			`${OPERATION_KEY}:intake`,
		]);
		const expectedItem = await deriveNutritionOperationKey([
			`${OPERATION_KEY}:intake-item`,
		]);
		expect(firstCall.operationKey).toBe(expectedOp);
		expect(firstCall.items[0]?.idempotencyKey).toBe(expectedItem);
		expect(firstCall.fuelTimeZone).toBeUndefined();

		// Same parent key → same derived keys (idempotent retries).
		logManifestIntakes.mockClear();
		// Bypass KV cache so the second call re-enters intake logging.
		(env.RATION_KV.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		await quickEatFromCargo(
			env,
			"org-1",
			principal,
			{ userId: "user-1" } as never,
			{
				...input,
			},
		);
		const secondCall = logManifestIntakes.mock.calls[0]?.[3] as {
			operationKey: string;
			items: Array<{ idempotencyKey: string }>;
		};
		expect(secondCall.operationKey).toBe(expectedOp);
		expect(secondCall.items[0]?.idempotencyKey).toBe(expectedItem);
	});

	it("forwards the request fuel time zone and does not send the cook date as the Fuel day", async () => {
		const env = createMockEnv();
		await quickEatFromCargo(
			env,
			"org-1",
			principal,
			{ userId: "user-1" } as never,
			{
				cargoId: "cargo-1",
				quantity: 1,
				unit: "unit",
				date: "2026-08-11",
				operationKey: OPERATION_KEY,
				fuelTimeZone: "America/Los_Angeles",
			},
		);
		const call = logManifestIntakes.mock.calls[0]?.[3] as {
			fuelTimeZone?: string;
			items: Array<{ date?: string }>;
		};
		expect(call.fuelTimeZone).toBe("America/Los_Angeles");
		expect(call.items[0]?.date).toBeUndefined();
	});

	it("does not cook when Fuel is on and the zone cannot be resolved", async () => {
		vi.mocked(isFeatureEnabled).mockImplementation(
			async (_env, flag) =>
				flag === "nutrition-fast-log" ||
				flag === "nutrition-manifest" ||
				flag === "nutrition-fuel-page",
		);
		const { database: db } = createSqliteD1();
		await db.exec(
			"CREATE TABLE user (id TEXT PRIMARY KEY, tier TEXT, tier_expires_at INTEGER, settings TEXT)",
		);
		await db
			.prepare(
				"INSERT INTO user (id, tier, tier_expires_at, settings) VALUES ('user-1', 'free', NULL, '{}')",
			)
			.run();
		const env = createMockEnv();
		env.DB = db;
		await expect(
			quickEatFromCargo(
				env,
				"org-1",
				principal,
				{ userId: "user-1" } as never,
				{
					cargoId: "cargo-1",
					quantity: 1,
					unit: "unit",
					date: "2026-08-11",
					operationKey: OPERATION_KEY,
					fuelTimeZone: "GMT",
				},
			),
		).rejects.toBeInstanceOf(FuelTimezoneRequiredError);
		expect(cookMealFromGalley).not.toHaveBeenCalled();
		vi.mocked(isFeatureEnabled).mockImplementation(
			async (_env, flag) => flag !== "nutrition-fuel-page",
		);
	});

	it("cooks when Fuel is off without writing a zone", async () => {
		const { database: db } = createSqliteD1();
		await db.exec(
			"CREATE TABLE user (id TEXT PRIMARY KEY, tier TEXT, tier_expires_at INTEGER, settings TEXT)",
		);
		await db
			.prepare(
				"INSERT INTO user (id, tier, tier_expires_at, settings) VALUES ('user-1', 'free', NULL, '{}')",
			)
			.run();
		const env = createMockEnv();
		env.DB = db;
		await quickEatFromCargo(
			env,
			"org-1",
			principal,
			{ userId: "user-1" } as never,
			{
				cargoId: "cargo-1",
				quantity: 1,
				unit: "unit",
				date: "2026-08-11",
				operationKey: OPERATION_KEY,
			},
		);
		expect(cookMealFromGalley).toHaveBeenCalled();
		const row = await db
			.prepare(
				"SELECT json_extract(settings, '$.fuelTimeZone') AS zone FROM user WHERE id = 'user-1'",
			)
			.first<{ zone: string | null }>();
		expect(row?.zone).toBeNull();
	});
});
