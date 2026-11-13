import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getCargoPage = vi.fn();
const getCargoCount = vi.fn();
const attachTagsToCargo = vi.fn();
const getActiveCargoIds = vi.fn();
const addOrMergeItem = vi.fn();

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/cargo-selection.server", () => ({
	getActiveCargoIds: (...args: unknown[]) => getActiveCargoIds(...args),
}));

vi.mock("~/lib/cargo.server", async (importOriginal) => ({
	...(await importOriginal<typeof import("~/lib/cargo.server")>()),
	getCargoPage: (...args: unknown[]) => getCargoPage(...args),
	getCargoCount: (...args: unknown[]) => getCargoCount(...args),
	attachTagsToCargo: (...args: unknown[]) => attachTagsToCargo(...args),
	addOrMergeItem: (...args: unknown[]) => addOrMergeItem(...args),
}));

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

const ctx = { cloudflare: { env: { DB: {}, RATION_KV: {} } } } as never;

describe("GET /api/mobile/v1/cargo", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			getCargoPage,
			getCargoCount,
			attachTagsToCargo,
			getActiveCargoIds,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
		getCargoPage.mockResolvedValue({
			items: [{ id: "cargo_1", name: "Milk" }],
			nextCursor: null,
		});
		getCargoCount.mockResolvedValue(1);
		getActiveCargoIds.mockResolvedValue(["cargo_1"]);
		attachTagsToCargo.mockResolvedValue([
			{
				id: "cargo_1",
				name: "Milk",
				tags: [
					{
						id: "tag_pink",
						slug: "dairy",
						name: "Dairy",
						color: "#EC4899",
						category: null,
					},
				],
			},
		]);
	});

	it("returns full tag records including color on list items", async () => {
		const { loader } = await import("~/routes/api/mobile/v1.cargo");
		const result = (await loader({
			request: new Request("https://ration.mayutic.com/api/mobile/v1/cargo"),
			context: ctx,
			params: {},
		} as never)) as {
			items: {
				id: string;
				tags: { slug: string; color: string | null }[];
			}[];
			total: number;
			activeCargoIds: string[];
			nextCursor: string | null;
		};

		expect(attachTagsToCargo).toHaveBeenCalledWith({}, [
			{ id: "cargo_1", name: "Milk" },
		]);
		const listed = result.items[0] as {
			id: string;
			name: string;
			organizationId: string;
			status: string;
			createdAt: string;
			nutrition: unknown;
			tags: { slug: string; color: string | null }[];
		};
		expect(listed.id).toBe("cargo_1");
		expect(listed.name).toBe("Milk");
		expect(listed.organizationId).toBe("org_1");
		expect(listed.status).toBe("stable");
		expect(listed.nutrition).toBeNull();
		expect(typeof listed.createdAt).toBe("string");
		expect(listed.tags).toEqual([
			{
				id: "tag_pink",
				slug: "dairy",
				name: "Dairy",
				color: "#EC4899",
				category: null,
			},
		]);
		expect(result.total).toBe(1);
		expect(result.activeCargoIds).toEqual(["cargo_1"]);
		expect(result.nextCursor).toBeNull();
	});
});

describe("POST /api/mobile/v1/cargo", () => {
	beforeEach(() => {
		for (const m of [
			requireMobileActiveGroup,
			checkRateLimit,
			addOrMergeItem,
			attachTagsToCargo,
		]) {
			m.mockReset();
		}
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user_1",
			organizationId: "org_1",
		});
		checkRateLimit.mockResolvedValue({ allowed: true });
	});

	it("passes userId and flagContext into addOrMergeItem for nutrition Flagship context", async () => {
		addOrMergeItem.mockResolvedValue({
			status: "created",
			item: { id: "cargo_new", name: "oats" },
		});
		attachTagsToCargo.mockResolvedValue([
			{ id: "cargo_new", name: "oats", tags: [] },
		]);

		const { action } = await import("~/routes/api/mobile/v1.cargo");
		await action({
			request: new Request("https://ration.mayutic.com/api/mobile/v1/cargo", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "oats",
					quantity: 1,
					unit: "kg",
					domain: "food",
					tags: [],
					nutrition: {
						source: "user_override",
						confidence: 1,
						verified: true,
						per100g: null,
						perServing: {
							energyKcal: 100,
							proteinG: 5,
							fatG: 2,
							carbG: 15,
							fiberG: null,
							sugarG: null,
							satFatG: null,
							sodiumMg: null,
							saltG: null,
						},
						fdcId: null,
						description: null,
					},
				}),
			}),
			context: {
				cloudflare: {
					env: {
						DB: {},
						RATION_KV: {},
						FLAGSHIP_ENV: "dev",
						CLOUDFLARE_ENV: "dev",
					},
					ctx: { waitUntil: vi.fn() },
				},
			} as never,
			params: {},
		} as never);

		expect(addOrMergeItem).toHaveBeenCalledWith(
			expect.anything(),
			"org_1",
			expect.objectContaining({
				name: "oats",
				nutrition: expect.objectContaining({ source: "user_override" }),
			}),
			expect.objectContaining({
				userId: "user_1",
				flagContext: expect.objectContaining({
					clientPlatform: "ios",
				}),
			}),
		);
	});

	it("returns an iOS cargo item when a tagged override merges into an index row", async () => {
		const updatedAt = new Date("2026-11-13T12:00:00.000Z");
		addOrMergeItem.mockResolvedValue({
			status: "merged",
			item: {
				id: "cargo_existing",
				name: "yogurt",
				domain: "food",
				quantity: 2,
				unit: "unit",
				expiresAt: null,
				updatedAt,
				nutrition: JSON.stringify({
					source: "user_override",
					confidence: 1,
					verified: true,
					per100g: null,
					perServing: {
						energyKcal: 10,
						proteinG: 200,
						fatG: 200,
						carbG: 200,
						fiberG: null,
						sugarG: null,
						satFatG: null,
						sodiumMg: null,
						saltG: null,
					},
					fdcId: null,
					description: null,
				}),
			},
		});
		attachTagsToCargo.mockImplementation(
			async (_db: unknown, rows: unknown[]) =>
				(rows as Array<Record<string, unknown>>).map((row) => ({
					...row,
					tags: [
						{
							id: "tag_1",
							slug: "test",
							name: "Test",
							color: null,
							category: null,
						},
					],
				})),
		);

		const { action } = await import("~/routes/api/mobile/v1.cargo");
		const result = (await action({
			request: new Request("https://ration.mayutic.com/api/mobile/v1/cargo", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "yogurt",
					quantity: 1,
					unit: "unit",
					domain: "food",
					tags: ["Test"],
				}),
			}),
			context: {
				cloudflare: {
					env: {
						DB: {},
						RATION_KV: {},
						FLAGSHIP_ENV: "dev",
						CLOUDFLARE_ENV: "dev",
					},
					ctx: { waitUntil: vi.fn() },
				},
			} as never,
			params: {},
		} as never)) as {
			item: {
				organizationId: string;
				status: string;
				createdAt: string;
				tags: { slug: string }[];
				nutrition: {
					source: string;
					fdcId: number | null;
					perServing: { energyKcal: number; proteinG: number };
				};
			};
		};

		expect(result.item.organizationId).toBe("org_1");
		expect(result.item.status).toBe("stable");
		expect(result.item.createdAt).toBe("2026-11-13T12:00:00.000Z");
		expect(result.item.tags.map((tag) => tag.slug)).toEqual(["test"]);
		expect(result.item.nutrition.source).toBe("user_override");
		expect(result.item.nutrition.fdcId).toBeNull();
		expect(result.item.nutrition.perServing.energyKcal).toBe(10);
		expect(result.item.nutrition.perServing.proteinG).toBe(200);
	});
});
