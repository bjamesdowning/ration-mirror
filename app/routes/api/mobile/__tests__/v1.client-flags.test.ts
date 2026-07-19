import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockEnv, createMockFlagship } from "~/test/helpers/mock-env";

const checkRateLimit = vi.fn();

vi.mock("~/lib/rate-limiter.server", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/lib/rate-limiter.server")>();
	return {
		...actual,
		checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
	};
});

import { loader } from "~/routes/api/mobile/v1.client-flags";

describe("GET /api/mobile/v1/client-flags", () => {
	beforeEach(() => {
		checkRateLimit.mockReset();
		checkRateLimit.mockResolvedValue({ allowed: true });
	});

	it("returns clientVisible flags including appReviewLogin", async () => {
		const getBooleanValue = vi.fn().mockImplementation(async (key: string) => {
			return key === "app-review-login";
		});
		const env = {
			...createMockEnv(),
			FLAGS: createMockFlagship({ getBooleanValue }),
		};
		const context = { cloudflare: { env } } as never;
		const request = new Request(
			"https://ration.mayutic.com/api/mobile/v1/client-flags",
		);

		const result = await loader({ request, context, params: {} } as never);

		expect(result).toMatchObject({
			clientFlags: expect.objectContaining({
				appReviewLogin: true,
			}),
		});
	});
});
