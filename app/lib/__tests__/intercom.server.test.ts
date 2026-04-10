import { describe, expect, it } from "vitest";
import { intercomIdentityHash, signIntercomJwt } from "../intercom.server";

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
	// Copy into a fresh Uint8Array so verify() accepts BufferSource under strict TS
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

describe("intercomIdentityHash", () => {
	it("matches openssl HMAC-SHA256 hex for UTF-8 user id", async () => {
		// printf 'user123' | openssl dgst -sha256 -hmac 'testsecret' -hex
		const expected =
			"8e9c6e4d334aef1d1b18f6222aa1b72ce9d3066a7425f3c7187564e246457163";
		await expect(intercomIdentityHash("user123", "testsecret")).resolves.toBe(
			expected,
		);
	});
});

describe("signIntercomJwt", () => {
	const secret = "test-messenger-secret";
	const nowSeconds = 1_700_000_000;

	it("returns null when userId is empty", async () => {
		await expect(
			signIntercomJwt("", "a@b.com", null, secret, { nowSeconds }),
		).resolves.toBeNull();
		await expect(
			signIntercomJwt("   ", "a@b.com", null, secret, { nowSeconds }),
		).resolves.toBeNull();
	});

	it("returns null when secret is empty", async () => {
		await expect(
			signIntercomJwt("user-1", "a@b.com", null, "", { nowSeconds }),
		).resolves.toBeNull();
		await expect(
			signIntercomJwt("user-1", "a@b.com", null, "  ", { nowSeconds }),
		).resolves.toBeNull();
	});

	it("produces a valid three-part JWT with verifiable HS256 signature", async () => {
		const token = await signIntercomJwt(
			"user-abc",
			"user@example.com",
			null,
			secret,
			{ nowSeconds },
		);
		expect(token).not.toBeNull();
		if (token === null) return;
		expect(token.split(".")).toHaveLength(3);
		await expect(verifyJwtHs256(token, secret)).resolves.toBe(true);
	});

	it("payload includes user_id, email, exp; omits company_id when null", async () => {
		const token = await signIntercomJwt(
			"user-xyz",
			"e@mail.com",
			null,
			secret,
			{ nowSeconds },
		);
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.user_id).toBe("user-xyz");
		expect(payload.email).toBe("e@mail.com");
		expect(payload.exp).toBe(nowSeconds + 300);
		expect(payload.company_id).toBeUndefined();
	});

	it("omits email when blank", async () => {
		const token = await signIntercomJwt("user-no-email", "  ", null, secret, {
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
		const token = await signIntercomJwt(
			"user-1",
			"a@b.com",
			"org-uuid-123",
			secret,
			{ nowSeconds },
		);
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.company_id).toBe("org-uuid-123");
	});

	it("omits company_id when empty string", async () => {
		const token = await signIntercomJwt("user-1", "a@b.com", "   ", secret, {
			nowSeconds,
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		const payload = parseJwtPayload(token);
		expect(payload.company_id).toBeUndefined();
	});

	it("fails verification with wrong secret", async () => {
		const token = await signIntercomJwt("user-1", "a@b.com", null, secret, {
			nowSeconds,
		});
		expect(token).not.toBeNull();
		if (token === null) return;
		await expect(verifyJwtHs256(token, "wrong-secret")).resolves.toBe(false);
	});
});
