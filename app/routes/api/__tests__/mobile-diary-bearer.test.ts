import { beforeEach, describe, expect, it, vi } from "vitest";

const requireActiveGroup = vi.hoisted(() => vi.fn());
const requireMobileActiveGroup = vi.hoisted(() => vi.fn());

vi.mock("~/lib/auth.server", () => ({
	requireActiveGroup: (...args: unknown[]) => requireActiveGroup(...args),
}));

vi.mock("~/lib/mobile/auth.server", () => ({
	requireMobileActiveGroup: (...args: unknown[]) =>
		requireMobileActiveGroup(...args),
}));

vi.mock("~/lib/nutrition/diary-http.server", () => ({
	beginDiaryRequest: vi.fn(),
}));

vi.mock("~/lib/error-handler", () => ({
	handleApiError: (error: unknown) => error,
}));

import { resolveDiaryAuth } from "../nutrition.diary.shared";

function request(authorization?: string) {
	return new Request("https://ration.test/api/mobile/v1/nutrition/diary/intake-1", {
		method: "DELETE",
		headers: authorization ? { Authorization: authorization } : {},
	});
}

describe("resolveDiaryAuth", () => {
	beforeEach(() => {
		requireActiveGroup.mockReset();
		requireMobileActiveGroup.mockReset();
	});

	it("authenticates a mobile bearer without the web cookie redirect", async () => {
		requireMobileActiveGroup.mockResolvedValue({
			userId: "user-1",
			organizationId: "org-1",
		});

		const auth = await resolveDiaryAuth({
			request: request("Bearer token"),
			context: {} as never,
		});

		expect(auth).toEqual({ groupId: "org-1", userId: "user-1" });
		expect(requireMobileActiveGroup).toHaveBeenCalledTimes(1);
		expect(requireActiveGroup).not.toHaveBeenCalled();
	});

	it("keeps a cookie session on the web group lookup", async () => {
		requireActiveGroup.mockResolvedValue({
			groupId: "org-1",
			session: { user: { id: "user-1" } },
		});

		const auth = await resolveDiaryAuth({
			request: request(),
			context: {} as never,
		});

		expect(auth).toEqual({ groupId: "org-1", userId: "user-1" });
		expect(requireActiveGroup).toHaveBeenCalledTimes(1);
		expect(requireMobileActiveGroup).not.toHaveBeenCalled();
	});
});
