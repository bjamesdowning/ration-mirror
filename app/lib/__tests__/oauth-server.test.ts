import { beforeEach, describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: test doubles for the drizzle query builder
let currentDb: any;

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => currentDb),
}));

vi.mock("../logging.server", () => ({
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	redactId: (id: string) => `red(${id})`,
}));

const {
	listConnectedAgentGrants,
	revokeConnectedAgentGrant,
	requiresOAuthOrgSelection,
	shouldOAuthPostLoginRedirect,
	buildOAuthAccessTokenClaims,
	getJwksUrl,
} = await import("../oauth.server");
const { RATION_ORG_CLAIM } = await import("../oauth.constants");

const env = {
	DB: {},
	BETTER_AUTH_URL: "https://ration.mayutic.com",
} as unknown as Cloudflare.Env;

function selectChain(rows: unknown[]) {
	return {
		from: vi.fn(() => ({
			where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
		})),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("requiresOAuthOrgSelection", () => {
	it("is true when any mcp scope is requested", () => {
		expect(requiresOAuthOrgSelection(["mcp:read"])).toBe(true);
		expect(
			requiresOAuthOrgSelection(["offline_access", "mcp:supply:write"]),
		).toBe(true);
	});

	it("is false for non-mcp scopes", () => {
		expect(requiresOAuthOrgSelection(["offline_access", "profile"])).toBe(
			false,
		);
		expect(requiresOAuthOrgSelection([])).toBe(false);
	});
});

describe("shouldOAuthPostLoginRedirect", () => {
	it("requires select-org for MCP when session has no active household", () => {
		expect(shouldOAuthPostLoginRedirect(["mcp:read"], null)).toBe(true);
		expect(shouldOAuthPostLoginRedirect(["mcp:read"], undefined)).toBe(true);
	});

	it("skips select-org after household is bound on the session", () => {
		expect(shouldOAuthPostLoginRedirect(["mcp:read"], "org-1")).toBe(false);
	});

	it("is false for non-MCP scopes", () => {
		expect(shouldOAuthPostLoginRedirect(["profile"], null)).toBe(false);
	});
});

describe("buildOAuthAccessTokenClaims", () => {
	it("emits the org claim when a referenceId is present", () => {
		expect(buildOAuthAccessTokenClaims("org-9")).toEqual({
			[RATION_ORG_CLAIM]: "org-9",
		});
	});

	it("emits no claims without a referenceId", () => {
		expect(buildOAuthAccessTokenClaims()).toEqual({});
	});
});

describe("getJwksUrl", () => {
	it("derives the JWKS endpoint from the auth server issuer", () => {
		expect(getJwksUrl(env)).toBe("https://ration.mayutic.com/api/auth/jwks");
	});
});

describe("listConnectedAgentGrants", () => {
	it("hydrates client + org names and sorts by most recently updated", async () => {
		const older = {
			id: "consent-old",
			clientId: "client-a",
			referenceId: "org-1",
			scopes: ["mcp:read"],
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		};
		const newer = {
			id: "consent-new",
			clientId: "client-b",
			referenceId: null,
			scopes: ["mcp:read", "mcp:galley:write"],
			createdAt: new Date("2026-05-01T00:00:00Z"),
			updatedAt: new Date("2026-05-01T00:00:00Z"),
		};

		currentDb = {
			query: {
				oauthConsent: { findMany: vi.fn().mockResolvedValue([older, newer]) },
				organization: {
					findFirst: vi.fn().mockResolvedValue({ name: "Household One" }),
				},
			},
			select: vi.fn(() => selectChain([{ name: "Agent A" }])),
		};

		const grants = await listConnectedAgentGrants(env, "user-1");

		expect(grants.map((g) => g.consentId)).toEqual([
			"consent-new",
			"consent-old",
		]);
		const old = grants.find((g) => g.consentId === "consent-old");
		expect(old?.clientName).toBe("Agent A");
		expect(old?.organizationName).toBe("Household One");
		expect(old?.organizationId).toBe("org-1");
	});

	it("tolerates missing client rows and absent org binding", async () => {
		const consent = {
			id: "consent-x",
			clientId: "client-x",
			referenceId: null,
			scopes: ["mcp:read"],
			createdAt: new Date("2026-02-01T00:00:00Z"),
			updatedAt: new Date("2026-02-01T00:00:00Z"),
		};
		const organizationFindFirst = vi.fn();
		currentDb = {
			query: {
				oauthConsent: { findMany: vi.fn().mockResolvedValue([consent]) },
				organization: { findFirst: organizationFindFirst },
			},
			select: vi.fn(() => selectChain([])),
		};

		const grants = await listConnectedAgentGrants(env, "user-1");

		expect(grants).toHaveLength(1);
		expect(grants[0].clientName).toBeNull();
		expect(grants[0].organizationName).toBeNull();
		// No referenceId means no org lookup is attempted.
		expect(organizationFindFirst).not.toHaveBeenCalled();
	});

	it("normalizes space-separated scope strings from consent rows", async () => {
		const consent = {
			id: "consent-str",
			clientId: "client-str",
			referenceId: null,
			scopes: "mcp:read mcp:galley:write",
			createdAt: new Date("2026-03-01T00:00:00Z"),
			updatedAt: new Date("2026-03-01T00:00:00Z"),
		};
		currentDb = {
			query: {
				oauthConsent: { findMany: vi.fn().mockResolvedValue([consent]) },
				organization: { findFirst: vi.fn() },
			},
			select: vi.fn(() => selectChain([{ name: "Cursor" }])),
		};

		const grants = await listConnectedAgentGrants(env, "user-1");

		expect(grants[0]?.scopes).toEqual(["mcp:read", "mcp:galley:write"]);
	});
});

describe("revokeConnectedAgentGrant", () => {
	it("returns false when the grant does not belong to the user", async () => {
		currentDb = { select: vi.fn(() => selectChain([])) };

		const ok = await revokeConnectedAgentGrant(env, "user-1", "consent-1");
		expect(ok).toBe(false);
	});

	it("revokes refresh tokens and deletes the consent row", async () => {
		const updateWhere = vi.fn().mockResolvedValue(undefined);
		const deleteWhere = vi.fn().mockResolvedValue(undefined);
		const updateSet = vi.fn(() => ({ where: updateWhere }));

		currentDb = {
			select: vi.fn(() =>
				selectChain([
					{ id: "consent-1", clientId: "client-1", referenceId: "org-1" },
				]),
			),
			update: vi.fn(() => ({ set: updateSet })),
			delete: vi.fn(() => ({ where: deleteWhere })),
		};

		const ok = await revokeConnectedAgentGrant(env, "user-1", "consent-1");

		expect(ok).toBe(true);
		expect(updateSet).toHaveBeenCalledWith(
			expect.objectContaining({ revoked: expect.any(Date) }),
		);
		expect(updateWhere).toHaveBeenCalledTimes(1);
		expect(deleteWhere).toHaveBeenCalledTimes(1);
	});
});
