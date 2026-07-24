import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileActiveGroup = vi.fn();
const checkRateLimit = vi.fn();
const getCargoPage = vi.fn();
const getCargoCount = vi.fn();
const attachTagsToCargo = vi.fn();
const getActiveCargoIds = vi.fn();

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
	addOrMergeItem: vi.fn(),
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
		expect(result.items).toEqual([
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
		expect(result.total).toBe(1);
		expect(result.activeCargoIds).toEqual(["cargo_1"]);
		expect(result.nextCursor).toBeNull();
	});
});
