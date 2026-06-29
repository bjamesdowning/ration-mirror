import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/mobile/token.server", () => ({
	revokeMobileRefreshFamilies: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/r2-cleanup.server", () => ({
	deleteR2Prefix: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/vector.server", () => ({
	deleteCargoVectors: vi.fn().mockResolvedValue(undefined),
}));

import { purgeUserAccount } from "../user-purge.server";

describe("purgeUserAccount", () => {
	it("exports a purge function for web and mobile routes", () => {
		expect(typeof purgeUserAccount).toBe("function");
	});
});
