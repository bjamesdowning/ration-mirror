import { decodeJwt, exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";
import {
	assertAppleWebLoginAllowed,
	generateAppleClientSecret,
	hasAppleNativeCredentials,
	hasAppleWebCredentials,
	isAppleWebLoginAvailable,
	resolveAppleSocialProvider,
} from "../apple-web-login.server";

describe("hasAppleWebCredentials", () => {
	it("returns false when any web secret is missing", () => {
		expect(hasAppleWebCredentials(createMockEnv())).toBe(false);
		expect(
			hasAppleWebCredentials({
				...createMockEnv(),
				APPLE_SERVICES_ID: "com.mayutic.ration.web",
				APPLE_APP_BUNDLE_IDENTIFIER: "com.mayutic.ration",
			}),
		).toBe(false);
	});

	it("returns false when web secrets exist but bundle id is missing", () => {
		expect(
			hasAppleWebCredentials({
				...createMockEnv(),
				APPLE_SERVICES_ID: "com.mayutic.ration.web",
				APPLE_TEAM_ID: "TEAM123",
				APPLE_KEY_ID: "KEY123",
				APPLE_PRIVATE_KEY:
					"-----BEGIN PRIVATE KEY-----\nMIG\n-----END PRIVATE KEY-----",
			}),
		).toBe(false);
	});

	it("returns true when all four web secrets and bundle id are set", () => {
		expect(
			hasAppleWebCredentials({
				...createMockEnv(),
				APPLE_SERVICES_ID: "com.mayutic.ration.web",
				APPLE_TEAM_ID: "TEAM123",
				APPLE_KEY_ID: "KEY123",
				APPLE_PRIVATE_KEY:
					"-----BEGIN PRIVATE KEY-----\nMIG\n-----END PRIVATE KEY-----",
				APPLE_APP_BUNDLE_IDENTIFIER: "com.mayutic.ration",
			}),
		).toBe(true);
	});
});

describe("hasAppleNativeCredentials", () => {
	it("returns true when bundle id is set", () => {
		expect(
			hasAppleNativeCredentials({
				...createMockEnv(),
				APPLE_APP_BUNDLE_IDENTIFIER: "com.mayutic.ration",
			}),
		).toBe(true);
	});
});

describe("generateAppleClientSecret", () => {
	let privateKeyPem: string;
	const servicesId = "com.mayutic.ration.web";
	const teamId = "TEAM123";
	const keyId = "KEY123";

	beforeAll(async () => {
		const { privateKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		privateKeyPem = await exportPKCS8(privateKey);
	});

	it("produces a JWT with expected Apple claims", async () => {
		const secret = await generateAppleClientSecret(
			servicesId,
			teamId,
			keyId,
			privateKeyPem,
		);
		const claims = decodeJwt(secret);
		expect(claims.iss).toBe(teamId);
		expect(claims.sub).toBe(servicesId);
		expect(claims.aud).toBe("https://appleid.apple.com");
	});
});

describe("resolveAppleSocialProvider", () => {
	it("returns native-only config without web secrets", () => {
		const provider = resolveAppleSocialProvider({
			...createMockEnv(),
			APPLE_APP_BUNDLE_IDENTIFIER: "com.mayutic.ration",
		});
		expect(provider).toEqual({
			clientId: "com.mayutic.ration",
			appBundleIdentifier: "com.mayutic.ration",
			disableImplicitSignUp: true,
		});
	});

	it("returns async web config when web secrets and bundle id are set", async () => {
		const { privateKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		const privateKeyPem = await exportPKCS8(privateKey);
		const provider = resolveAppleSocialProvider({
			...createMockEnv(),
			APPLE_APP_BUNDLE_IDENTIFIER: "com.mayutic.ration",
			APPLE_SERVICES_ID: "com.mayutic.ration.web",
			APPLE_TEAM_ID: "TEAM123",
			APPLE_KEY_ID: "KEY123",
			APPLE_PRIVATE_KEY: privateKeyPem,
		});
		expect(typeof provider).toBe("function");
		const config = await (
			provider as () => Promise<{
				clientId: string;
				clientSecret: string;
				audience: string[];
				disableImplicitSignUp: true;
			}>
		)();
		expect(config.clientId).toBe("com.mayutic.ration.web");
		expect(config.audience).toEqual([
			"com.mayutic.ration.web",
			"com.mayutic.ration",
		]);
		expect(config.disableImplicitSignUp).toBe(true);
		expect(config.clientSecret.split(".")).toHaveLength(3);
	});

	it("returns undefined when web secrets exist without bundle id (misconfig)", () => {
		const provider = resolveAppleSocialProvider({
			...createMockEnv(),
			APPLE_SERVICES_ID: "com.mayutic.ration.web",
			APPLE_TEAM_ID: "TEAM123",
			APPLE_KEY_ID: "KEY123",
			APPLE_PRIVATE_KEY:
				"-----BEGIN PRIVATE KEY-----\nMIG\n-----END PRIVATE KEY-----",
		});
		expect(provider).toBeUndefined();
	});
});

describe("isAppleWebLoginAvailable", () => {
	const webEnv = {
		...createMockEnv(),
		APPLE_SERVICES_ID: "com.mayutic.ration.web",
		APPLE_TEAM_ID: "TEAM123",
		APPLE_KEY_ID: "KEY123",
		APPLE_PRIVATE_KEY:
			"-----BEGIN PRIVATE KEY-----\nMIG\n-----END PRIVATE KEY-----",
		APPLE_APP_BUNDLE_IDENTIFIER: "com.mayutic.ration",
		FEATURE_FLAG_OVERRIDES: JSON.stringify({ "apple-web-login": true }),
	};

	it("returns false without credentials", async () => {
		const enabled = await isAppleWebLoginAvailable(createMockEnv(), {
			userId: "u1",
		});
		expect(enabled).toBe(false);
	});

	it("returns true when flag override is on and credentials exist", async () => {
		const enabled = await isAppleWebLoginAvailable(webEnv, { userId: "u1" });
		expect(enabled).toBe(true);
	});
});

describe("assertAppleWebLoginAllowed", () => {
	const webEnv = {
		...createMockEnv(),
		APPLE_SERVICES_ID: "com.mayutic.ration.web",
		APPLE_TEAM_ID: "TEAM123",
		APPLE_KEY_ID: "KEY123",
		APPLE_PRIVATE_KEY:
			"-----BEGIN PRIVATE KEY-----\nMIG\n-----END PRIVATE KEY-----",
		APPLE_APP_BUNDLE_IDENTIFIER: "com.mayutic.ration",
		FEATURE_FLAG_OVERRIDES: JSON.stringify({ "apple-web-login": false }),
	};

	it("allows non-Apple auth routes", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/social",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: "google" }),
			},
		);
		await expect(
			assertAppleWebLoginAllowed(webEnv, request, { userId: "u1" }),
		).resolves.toBeUndefined();
	});

	it("blocks Apple callback when flag is off", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/callback/apple",
			{ method: "POST" },
		);
		await expect(
			assertAppleWebLoginAllowed(webEnv, request, { userId: "u1" }),
		).rejects.toMatchObject({ data: null, init: { status: 404 } });
	});

	it("blocks Apple sign-in social when flag is off", async () => {
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/social",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: "apple" }),
			},
		);
		await expect(
			assertAppleWebLoginAllowed(webEnv, request, { userId: "u1" }),
		).rejects.toMatchObject({ data: null, init: { status: 404 } });
	});

	it("allows Apple sign-in when flag is on", async () => {
		const enabledEnv = {
			...webEnv,
			FEATURE_FLAG_OVERRIDES: JSON.stringify({ "apple-web-login": true }),
		};
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/social",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: "apple" }),
			},
		);
		await expect(
			assertAppleWebLoginAllowed(enabledEnv, request, { userId: "u1" }),
		).resolves.toBeUndefined();
	});

	it("allows explicit Apple sign-up when flag is on (ToS gated elsewhere)", async () => {
		const enabledEnv = {
			...webEnv,
			FEATURE_FLAG_OVERRIDES: JSON.stringify({ "apple-web-login": true }),
		};
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/social",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider: "apple", requestSignUp: true }),
			},
		);
		await expect(
			assertAppleWebLoginAllowed(enabledEnv, request, { userId: "u1" }),
		).resolves.toBeUndefined();
	});

	it("allows explicit Apple sign-up with ToS confirmation when flag is on", async () => {
		const enabledEnv = {
			...webEnv,
			FEATURE_FLAG_OVERRIDES: JSON.stringify({ "apple-web-login": true }),
		};
		const request = new Request(
			"https://ration.mayutic.com/api/auth/sign-in/social",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					provider: "apple",
					requestSignUp: true,
					additionalData: { tosAccepted: true },
				}),
			},
		);
		await expect(
			assertAppleWebLoginAllowed(enabledEnv, request, { userId: "u1" }),
		).resolves.toBeUndefined();
	});
});
