import { describe, expect, it, vi } from "vitest";
import {
	isAuthorizeRedirectAllowed,
	isLoopbackHttpRedirect,
	matchesRegisteredRedirectUri,
} from "../oauth-loopback-redirect";

const pub = { publicClient: true };
const conf = { publicClient: false };

describe("matchesRegisteredRedirectUri", () => {
	it("keeps exact matching for every client", () => {
		const reg = ["https://claude.ai/api/mcp/auth_callback"];
		expect(
			matchesRegisteredRedirectUri(
				"https://claude.ai/api/mcp/auth_callback",
				reg,
				conf,
			),
		).toBe(true);
		expect(
			matchesRegisteredRedirectUri(
				"https://claude.ai/api/mcp/auth_callback/x",
				reg,
				pub,
			),
		).toBe(false);
	});

	it.each([
		["http://127.0.0.1:3000/callback", "http://127.0.0.1:54321/callback"],
		["http://127.0.0.1/callback", "http://127.0.0.1:8080/callback"],
		["http://localhost:1/cb", "http://localhost:65535/cb"],
		["http://[::1]:3000/cb", "http://[::1]:4000/cb"],
		["http://localhost:3000/cb?x=1", "http://localhost:9/cb?x=1"],
	])(
		"public client: %s accepts port-only variant %s",
		(registered, requested) => {
			expect(matchesRegisteredRedirectUri(requested, [registered], pub)).toBe(
				true,
			);
		},
	);

	it("confidential clients keep exact matching on loopback", () => {
		expect(
			matchesRegisteredRedirectUri(
				"http://127.0.0.1:5555/callback",
				["http://127.0.0.1:3000/callback"],
				conf,
			),
		).toBe(false);
		expect(
			matchesRegisteredRedirectUri(
				"http://127.0.0.1:3000/callback",
				["http://127.0.0.1:3000/callback"],
				conf,
			),
		).toBe(true);
	});

	it.each([
		// path must match
		["http://127.0.0.1:3000/callback", "http://127.0.0.1:4000/other"],
		["http://127.0.0.1:3000/callback", "http://127.0.0.1:4000/callback/"],
		// query must match
		["http://127.0.0.1:3000/cb?a=1", "http://127.0.0.1:4000/cb?a=2"],
		// host must match (no cross-loopback swapping)
		["http://127.0.0.1:3000/cb", "http://localhost:4000/cb"],
		["http://localhost:3000/cb", "http://[::1]:4000/cb"],
		// scheme must be http and match
		["http://127.0.0.1:3000/cb", "https://127.0.0.1:4000/cb"],
		["https://localhost:3000/cb", "https://localhost:4000/cb"],
		// non-loopback hosts never get port variance
		["http://example.com:3000/cb", "http://example.com:4000/cb"],
		["https://ration.mayutic.com:443/cb", "https://ration.mayutic.com:8443/cb"],
	])("rejects %s vs %s", (registered, requested) => {
		expect(matchesRegisteredRedirectUri(requested, [registered], pub)).toBe(
			false,
		);
	});

	it.each([
		"http://localhost.evil.com:4000/callback",
		"http://127.0.0.1.nip.io:4000/callback",
		"http://localhost@evil.com/callback",
		"http://localhost:4000@evil.com/callback",
		"http://user:pass@127.0.0.1:4000/callback",
		"http://127.0.0.1:4000/callback#frag",
		"http://127.0.0.1:4000/callback#",
		"http://127.0.0.1:4000/callback/../callback",
		"not a url",
	])("rejects lookalike / unsafe %s", (requested) => {
		const reg = [
			"http://localhost:3000/callback",
			"http://127.0.0.1:3000/callback",
		];
		const ok = matchesRegisteredRedirectUri(requested, reg, pub);
		if (requested === "http://127.0.0.1:4000/callback/../callback") {
			// URL parsing normalizes dot segments to /callback: same path.
			expect(ok).toBe(true);
		} else {
			expect(ok).toBe(false);
		}
	});

	it("does not treat lookalike hosts as loopback", () => {
		expect(isLoopbackHttpRedirect("http://localhost.evil.com/cb")).toBe(false);
		expect(isLoopbackHttpRedirect("http://127.0.0.1.nip.io/cb")).toBe(false);
		expect(isLoopbackHttpRedirect("http://localhost@evil.com/cb")).toBe(false);
		expect(isLoopbackHttpRedirect("http://[::1]:9/cb")).toBe(true);
	});
});

describe("isAuthorizeRedirectAllowed", () => {
	const registered = ["http://127.0.0.1:3000/callback"];

	it("allows port variance for public clients", async () => {
		const lookup = vi.fn().mockResolvedValue({
			redirectUris: registered,
			tokenEndpointAuthMethod: "none",
		});
		await expect(
			isAuthorizeRedirectAllowed(
				{ client_id: "c1", redirect_uri: "http://127.0.0.1:9999/callback" },
				lookup,
			),
		).resolves.toBe(true);
		expect(lookup).toHaveBeenCalledWith("c1");
	});

	it("rejects port variance for confidential clients", async () => {
		const lookup = vi.fn().mockResolvedValue({
			redirectUris: registered,
			tokenEndpointAuthMethod: "client_secret_basic",
		});
		await expect(
			isAuthorizeRedirectAllowed(
				{ client_id: "c1", redirect_uri: "http://127.0.0.1:9999/callback" },
				lookup,
			),
		).resolves.toBe(false);
	});

	it("passes through when client or params are missing", async () => {
		const lookup = vi.fn().mockResolvedValue(null);
		await expect(isAuthorizeRedirectAllowed(undefined, lookup)).resolves.toBe(
			true,
		);
		await expect(
			isAuthorizeRedirectAllowed(
				{ client_id: "x", redirect_uri: "http://127.0.0.1:1/cb" },
				lookup,
			),
		).resolves.toBe(true);
	});
});
