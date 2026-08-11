import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/purge-pending.server", () => ({
	isUserPurgePending: vi.fn().mockResolvedValue(false),
}));

vi.mock("~/lib/mobile/token.server", () => ({
	verifyMobileAccessToken: vi.fn(),
	assertMobileOrgMembership: vi.fn(),
}));

vi.mock("~/lib/mobile/responses.server", () => ({
	throwMobileJsonError: vi.fn(
		(message: string, status: number, code?: string) => {
			const err = Object.assign(new Error(message), {
				type: "DataWithResponseInit",
				data: { error: message, code },
				init: { status },
			});
			throw err;
		},
	),
}));

import { requireMobileAuth } from "~/lib/mobile/auth.server";
import {
	assertMobileOrgMembership,
	verifyMobileAccessToken,
} from "~/lib/mobile/token.server";

describe("requireMobileAuth D1 contention", () => {
	beforeEach(() => {
		vi.mocked(verifyMobileAccessToken).mockResolvedValue({
			userId: "user-1",
			organizationId: "org-1",
		});
		vi.mocked(assertMobileOrgMembership).mockReset();
	});

	it("maps SQLITE_BUSY membership failures to 503 server_busy", async () => {
		vi.mocked(assertMobileOrgMembership).mockRejectedValue(
			new Error("SQLITE_BUSY: database is locked"),
		);

		const request = new Request("https://example.com/api", {
			headers: { Authorization: "Bearer test-token" },
		});
		const context = {
			cloudflare: { env: { RATION_KV: {} } },
		} as never;

		try {
			await requireMobileAuth(context, request);
			expect.unreachable();
		} catch (error) {
			expect(error).toMatchObject({
				type: "DataWithResponseInit",
				data: { code: "server_busy" },
				init: { status: 503 },
			});
		}
	});

	it("still maps forbidden_org to 403", async () => {
		vi.mocked(assertMobileOrgMembership).mockRejectedValue(
			new Error("forbidden_org"),
		);

		const request = new Request("https://example.com/api", {
			headers: { Authorization: "Bearer test-token" },
		});
		const context = {
			cloudflare: { env: { RATION_KV: {} } },
		} as never;

		try {
			await requireMobileAuth(context, request);
			expect.unreachable();
		} catch (error) {
			expect(error).toMatchObject({
				init: { status: 403 },
				data: { code: "forbidden_org" },
			});
		}
	});
});
