import { describe, expect, it } from "vitest";
import {
	buildNativeCallbackHandoffPath,
	decodeNativeCallbackTarget,
	encodeNativeCallbackTarget,
	shouldUseClientCallbackHandoff,
	validateClientCallbackHandoffTarget,
} from "../oauth-native-handoff.server";

const WARP_CALLBACK =
	"warp://mcp/oauth2callback?code=abc123&state=xyz&iss=https%3A%2F%2Fration.mayutic.com%2Fapi%2Fauth";

const LOCALHOST_CALLBACK =
	"http://localhost:8787/callback?code=abc123&state=xyz";

const LOCALHOST_127_CALLBACK =
	"http://127.0.0.1:3335/oauth/callback?code=abc123&state=xyz";

const CURSOR_WWW_CALLBACK =
	"https://www.cursor.com/agents/mcp/oauth/callback?code=abc123&state=xyz";

const CURSOR_APEX_CALLBACK =
	"https://cursor.com/agents/mcp/oauth/callback?code=abc123&state=xyz";

describe("native callback handoff encoding", () => {
	it("round-trips warp callback URLs", () => {
		const encoded = encodeNativeCallbackTarget(WARP_CALLBACK);
		expect(decodeNativeCallbackTarget(encoded)).toBe(WARP_CALLBACK);
		expect(buildNativeCallbackHandoffPath(WARP_CALLBACK)).toMatch(
			/^\/oauth\/return\?to=/,
		);
	});

	it("round-trips localhost http callback URLs", () => {
		const encoded = encodeNativeCallbackTarget(LOCALHOST_CALLBACK);
		expect(decodeNativeCallbackTarget(encoded)).toBe(LOCALHOST_CALLBACK);
		expect(buildNativeCallbackHandoffPath(LOCALHOST_CALLBACK)).toMatch(
			/^\/oauth\/return\?to=/,
		);
	});

	it("round-trips Cursor hosted callback URLs", () => {
		const encoded = encodeNativeCallbackTarget(CURSOR_WWW_CALLBACK);
		expect(decodeNativeCallbackTarget(encoded)).toBe(CURSOR_WWW_CALLBACK);
		expect(buildNativeCallbackHandoffPath(CURSOR_APEX_CALLBACK)).toMatch(
			/^\/oauth\/return\?to=/,
		);
	});
});

describe("shouldUseClientCallbackHandoff", () => {
	it("returns true for native and localhost http callbacks", () => {
		expect(shouldUseClientCallbackHandoff(WARP_CALLBACK)).toBe(true);
		expect(shouldUseClientCallbackHandoff(LOCALHOST_CALLBACK)).toBe(true);
		expect(shouldUseClientCallbackHandoff(LOCALHOST_127_CALLBACK)).toBe(true);
	});

	it("returns true only for the two Cursor hosted callbacks with a code", () => {
		expect(shouldUseClientCallbackHandoff(CURSOR_WWW_CALLBACK)).toBe(true);
		expect(shouldUseClientCallbackHandoff(CURSOR_APEX_CALLBACK)).toBe(true);
		expect(
			shouldUseClientCallbackHandoff(
				"https://WWW.CURSOR.COM/agents/mcp/oauth/callback?code=abc123",
			),
		).toBe(true);
		expect(
			shouldUseClientCallbackHandoff(
				"https://www.cursor.com:443/agents/mcp/oauth/callback?code=abc123",
			),
		).toBe(true);
	});

	it("returns false for internal and remote https callbacks", () => {
		expect(
			shouldUseClientCallbackHandoff("/oauth/consent?oauth_query=abc"),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://evil.com/callback?code=abc&state=xyz",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://www.cursor.com/agents/mcp/oauth/callback",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://www.cursor.com/agents/mcp/oauth/callback?code=",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://www.cursor.com/agents/mcp/oauth/callback?code=%20",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://cursor.com/agents/mcp/oauth/callback?state=xyz",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"http://www.cursor.com/agents/mcp/oauth/callback?code=abc123",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"http://cursor.com/agents/mcp/oauth/callback?code=abc123",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://www.cursor.com/agents/mcp/oauth/callback/extra?code=abc123",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://www.cursor.com/agents/mcp/oauth/callback/?code=abc123",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://cursor.com.evil.com/agents/mcp/oauth/callback?code=abc123",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://evil.com/agents/mcp/oauth/callback?code=abc123",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://user:pass@www.cursor.com/agents/mcp/oauth/callback?code=abc123",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://www.cursor.com:444/agents/mcp/oauth/callback?code=abc123",
			),
		).toBe(false);
		expect(
			shouldUseClientCallbackHandoff(
				"https://cursor.com./agents/mcp/oauth/callback?code=abc123",
			),
		).toBe(false);
	});
});

describe("validateClientCallbackHandoffTarget", () => {
	it("accepts warp callbacks with authorization codes", () => {
		expect(validateClientCallbackHandoffTarget(WARP_CALLBACK)).toBe(
			WARP_CALLBACK,
		);
	});

	it("accepts localhost http callbacks with authorization codes", () => {
		expect(validateClientCallbackHandoffTarget(LOCALHOST_CALLBACK)).toBe(
			LOCALHOST_CALLBACK,
		);
		expect(validateClientCallbackHandoffTarget(LOCALHOST_127_CALLBACK)).toBe(
			LOCALHOST_127_CALLBACK,
		);
	});

	it("accepts the two Cursor hosted callbacks with authorization codes", () => {
		expect(validateClientCallbackHandoffTarget(CURSOR_WWW_CALLBACK)).toBe(
			CURSOR_WWW_CALLBACK,
		);
		expect(validateClientCallbackHandoffTarget(CURSOR_APEX_CALLBACK)).toBe(
			CURSOR_APEX_CALLBACK,
		);
	});

	it("rejects callbacks without codes", () => {
		expect(
			validateClientCallbackHandoffTarget(
				"warp://mcp/oauth2callback?state=xyz",
			),
		).toBeNull();
		expect(
			validateClientCallbackHandoffTarget(
				"http://localhost:8787/callback?state=xyz",
			),
		).toBeNull();
		expect(
			validateClientCallbackHandoffTarget(
				"https://www.cursor.com/agents/mcp/oauth/callback?state=xyz",
			),
		).toBeNull();
		expect(
			validateClientCallbackHandoffTarget(
				"https://cursor.com/agents/mcp/oauth/callback?code=",
			),
		).toBeNull();
	});

	it("rejects arbitrary https callbacks even with codes", () => {
		expect(
			validateClientCallbackHandoffTarget(
				"https://evil.com/callback?code=abc&state=xyz",
			),
		).toBeNull();
		expect(
			validateClientCallbackHandoffTarget(
				"https://claude.ai/api/mcp/auth_callback?code=abc",
			),
		).toBeNull();
	});
});
