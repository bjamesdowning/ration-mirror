import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveOrgAvatarViewerUserId = vi.fn();
const storageGet = vi.fn();

vi.mock("~/lib/org-avatar-auth.server", () => ({
	resolveOrgAvatarViewerUserId: (...args: unknown[]) =>
		resolveOrgAvatarViewerUserId(...args),
}));

function makeContext() {
	return {
		cloudflare: {
			env: {
				STORAGE: {
					get: storageGet,
				},
			},
		},
	} as never;
}

function makeRequest(auth?: string) {
	const headers = new Headers();
	if (auth) headers.set("Authorization", auth);
	return new Request(
		`https://ration.mayutic.com/api/organization/avatar/org_1`,
		{
			headers,
		},
	);
}

describe("GET /api/organization/avatar/:orgId", () => {
	beforeEach(() => {
		resolveOrgAvatarViewerUserId.mockReset();
		storageGet.mockReset();
	});

	it("returns logo bytes for authenticated member", async () => {
		resolveOrgAvatarViewerUserId.mockResolvedValue("user_1");
		storageGet.mockResolvedValue({
			body: new Uint8Array([1, 2, 3]),
			httpEtag: '"abc"',
			writeHttpMetadata: (headers: Headers) => {
				headers.set("Content-Type", "image/png");
			},
		});

		const { loader } = await import("~/routes/api/organization/avatar.$orgId");
		const response = await loader({
			params: { orgId: "org_1" },
			context: makeContext(),
			request: makeRequest("Bearer mobile-token"),
		} as never);

		expect(response.status).toBe(200);
		expect(resolveOrgAvatarViewerUserId).toHaveBeenCalledWith(
			expect.anything(),
			expect.any(Request),
			"org_1",
		);
		expect(storageGet).toHaveBeenCalledWith("organizations/org_1/logo");
		expect(response.headers.get("Cache-Control")).toBe(
			"private, max-age=86400",
		);
	});

	it("returns 404 when viewer is not authorized", async () => {
		resolveOrgAvatarViewerUserId.mockResolvedValue(null);

		const { loader } = await import("~/routes/api/organization/avatar.$orgId");
		const response = await loader({
			params: { orgId: "org_1" },
			context: makeContext(),
			request: makeRequest("Bearer bad-token"),
		} as never);

		expect(response.status).toBe(404);
		expect(storageGet).not.toHaveBeenCalled();
	});

	it("returns 404 when logo object is missing", async () => {
		resolveOrgAvatarViewerUserId.mockResolvedValue("user_1");
		storageGet.mockResolvedValue(null);

		const { loader } = await import("~/routes/api/organization/avatar.$orgId");
		const response = await loader({
			params: { orgId: "org_1" },
			context: makeContext(),
			request: makeRequest(),
		} as never);

		expect(response.status).toBe(404);
	});

	it("returns 404 for invalid org id param", async () => {
		const { loader } = await import("~/routes/api/organization/avatar.$orgId");
		const response = await loader({
			params: { orgId: "../evil" },
			context: makeContext(),
			request: makeRequest(),
		} as never);

		expect(response.status).toBe(404);
	});
});
