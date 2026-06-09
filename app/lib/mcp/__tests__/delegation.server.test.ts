import { beforeEach, describe, expect, it, vi } from "vitest";
import { signDelegationToken } from "../../fin-delegation.server";

const { memberFindFirst } = vi.hoisted(() => ({
	memberFindFirst: vi.fn(),
}));

vi.mock("drizzle-orm/d1", () => ({
	drizzle: vi.fn(() => ({
		query: {
			member: { findFirst: memberFindFirst },
		},
	})),
}));

const {
	isFinDelegationClient,
	parseFinDelegationClientIds,
	verifyDelegationToken,
} = await import("../delegation.server");

const SECRET = "test-delegation-secret-32chars-min!!";
const ISSUER = "https://ration.mayutic.com";

function makeEnv(overrides?: Partial<Cloudflare.Env>): Cloudflare.Env {
	return {
		DB: {} as D1Database,
		FIN_MCP_DELEGATION_SECRET: SECRET,
		BETTER_AUTH_URL: ISSUER,
		...overrides,
	} as Cloudflare.Env;
}

describe("delegation.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		memberFindFirst.mockResolvedValue({ id: "mem-1" });
	});

	it("parses Fin delegation client allowlist", () => {
		expect(parseFinDelegationClientIds(" fin-a , fin-b ")).toEqual(
			new Set(["fin-a", "fin-b"]),
		);
		expect(parseFinDelegationClientIds(undefined)).toEqual(new Set());
	});

	it("checks allowlisted Fin clients", () => {
		const env = makeEnv({
			FIN_DELEGATION_CLIENT_IDS: "client-fin,client-other",
		});
		expect(isFinDelegationClient(env, "client-fin")).toBe(true);
		expect(isFinDelegationClient(env, "client-unknown")).toBe(false);
	});

	it("verifies delegation token with live membership check", async () => {
		const env = makeEnv();
		const token = await signDelegationToken({
			userId: "user-1",
			organizationId: "org-1",
			secret: SECRET,
			issuer: ISSUER,
		});

		if (!token) throw new Error("expected token");
		const claims = await verifyDelegationToken(env, token);
		expect(claims).toEqual({ userId: "user-1", organizationId: "org-1" });
		expect(memberFindFirst).toHaveBeenCalled();
	});

	it("rejects when membership is revoked", async () => {
		memberFindFirst.mockResolvedValue(undefined);
		const env = makeEnv();
		const token = await signDelegationToken({
			userId: "user-1",
			organizationId: "org-1",
			secret: SECRET,
			issuer: ISSUER,
		});

		if (!token) throw new Error("expected token");
		await expect(verifyDelegationToken(env, token)).rejects.toMatchObject({
			name: "McpDelegationError",
			code: "delegation_membership_revoked",
		});
	});
});
