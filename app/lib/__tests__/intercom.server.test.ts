import { describe, expect, it } from "vitest";
import { signIntercomJwt } from "../intercom.server";

function base64UrlDecodeToString(s: string): string {
	const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	return new TextDecoder().decode(bytes);
}

function base64UrlDecodeToBytes(s: string): Uint8Array {
	const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	return bytes;
}

async function verifyJwtHs256(token: string, secret: string): Promise<boolean> {
	const parts = token.split(".");
	if (parts.length !== 3) return false;
	const [h, p, sigB64] = parts;
	if (!h || !p || !sigB64) return false;
	const signingInput = `${h}.${p}`;
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	const sig = base64UrlDecodeToBytes(sigB64);
	const sigCopy = new Uint8Array(sig);
	return crypto.subtle.verify("HMAC", key, sigCopy, enc.encode(signingInput));
}

function parseJwtPayload(token: string): Record<string, unknown> {
	const parts = token.split(".");
	const mid = parts[1];
	if (parts.length !== 3 || mid === undefined) {
		throw new Error("invalid JWT shape");
	}
	return JSON.parse(base64UrlDecodeToString(mid)) as Record<string, unknown>;
}

function parseJwtHeader(token: string): Record<string, unknown> {
	const parts = token.split(".");
	const first = parts[0];
	if (parts.length !== 3 || first === undefined) {
		throw new Error("invalid JWT shape");
	}
	return JSON.parse(base64UrlDecodeToString(first)) as Record<string, unknown>;
}

describe("signIntercomJwt", () => {
	const secret = "test-messenger-secret";
	const nowSeconds = 1_700_000_000;

	it("returns null when userId is empty", async () => {
		await expect(
			signIntercomJwt({ userId: "", email: "a@b.com", secret, nowSeconds }),
		).resolves.toBeNull();
		await expect(
			signIntercomJwt({ userId: "   ", email: "a@b.com", secret, nowSeconds }),
		).resolves.toBeNull();
	});

	it("returns null when secret is empty", async () => {
		await expect(
			signIntercomJwt({
				userId: "user-1",
				email: "a@b.com",
				secret: "",
				nowSeconds,
			}),
		).resolves.toBeNull();
		await expect(
			signIntercomJwt({
				userId: "user-1",
				email: "a@b.com",
				secret: "  ",
				nowSeconds,
			}),
		).resolves.toBeNull();
	});

	it("produces a valid three-part JWT with verifiable HS256 signature", async () => {
		const token = await signIntercomJwt({
			userId: "user-abc",
			email: "user@example.com",
			secret,
			nowSeconds,
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		expect(token.split(".")).toHaveLength(3);
		const header = parseJwtHeader(token);
		expect(header.alg).toBe("HS256");
		expect(header.typ).toBe("JWT");
		await expect(verifyJwtHs256(token, secret)).resolves.toBe(true);
	});

	it("payload includes user_id, iat, exp and email; omits company_id when not provided", async () => {
		const token = await signIntercomJwt({
			userId: "user-xyz",
			email: "e@mail.com",
			secret,
			nowSeconds,
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.user_id).toBe("user-xyz");
		expect(payload.email).toBe("e@mail.com");
		expect(payload.iat).toBe(nowSeconds);
		expect(payload.exp).toBe(nowSeconds + 300);
		expect(payload.company_id).toBeUndefined();
	});

	it("omits email when blank", async () => {
		const token = await signIntercomJwt({
			userId: "user-no-email",
			email: "  ",
			secret,
			nowSeconds,
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.user_id).toBe("user-no-email");
		expect(payload.email).toBeUndefined();
		expect(payload.exp).toBe(nowSeconds + 300);
	});

	it("includes company_id when provided", async () => {
		const token = await signIntercomJwt({
			userId: "user-1",
			email: "a@b.com",
			companyId: "org-uuid-123",
			secret,
			nowSeconds,
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.company_id).toBe("org-uuid-123");
	});

	it("omits company_id when empty string", async () => {
		const token = await signIntercomJwt({
			userId: "user-1",
			email: "a@b.com",
			companyId: "   ",
			secret,
			nowSeconds,
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.company_id).toBeUndefined();
	});

	it("fails verification with wrong secret", async () => {
		const token = await signIntercomJwt({
			userId: "user-1",
			email: "a@b.com",
			secret,
			nowSeconds,
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		await expect(verifyJwtHs256(token, "wrong-secret")).resolves.toBe(false);
	});

	it("includes signed attributes in payload", async () => {
		const token = await signIntercomJwt({
			userId: "user-1",
			email: "a@b.com",
			secret,
			nowSeconds,
			attributes: {
				tier: "crew_member",
				tier_expired: false,
				stripe_customer_id: "cus_abc123",
				subscription_cancel_at_period_end: false,
				welcome_voucher_redeemed: true,
				is_admin: false,
				org_role: "owner",
				credit_balance: 77,
				tos_version: "2026-03-11",
				theme: "dark",
			},
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.tier).toBe("crew_member");
		expect(payload.tier_expired).toBe(false);
		expect(payload.stripe_customer_id).toBe("cus_abc123");
		expect(payload.subscription_cancel_at_period_end).toBe(false);
		expect(payload.welcome_voucher_redeemed).toBe(true);
		expect(payload.is_admin).toBe(false);
		expect(payload.org_role).toBe("owner");
		expect(payload.credit_balance).toBe(77);
		expect(payload.tos_version).toBe("2026-03-11");
		expect(payload.theme).toBe("dark");
	});

	it("omits signed attributes with null/undefined values", async () => {
		const token = await signIntercomJwt({
			userId: "user-1",
			email: "a@b.com",
			secret,
			nowSeconds,
			attributes: {
				tier: "free",
				stripe_customer_id: undefined,
				tier_expires_at: undefined,
				crew_subscribed_at: undefined,
			},
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.tier).toBe("free");
		expect(payload.stripe_customer_id).toBeUndefined();
		expect(payload.tier_expires_at).toBeUndefined();
		expect(payload.crew_subscribed_at).toBeUndefined();
	});

	it("sanitizes string attributes — drops values exceeding 128 chars", async () => {
		const longValue = "x".repeat(129);
		const token = await signIntercomJwt({
			userId: "user-1",
			email: "a@b.com",
			secret,
			nowSeconds,
			attributes: { org_role: longValue },
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.org_role).toBeUndefined();
	});

	it("includes numeric timestamp attributes", async () => {
		const expiresAt = nowSeconds + 86400;
		const token = await signIntercomJwt({
			userId: "user-1",
			email: "a@b.com",
			secret,
			nowSeconds,
			attributes: {
				tier_expires_at: expiresAt,
				crew_subscribed_at: nowSeconds,
			},
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.tier_expires_at).toBe(expiresAt);
		expect(payload.crew_subscribed_at).toBe(nowSeconds);
	});
});
