import { describe, expect, it } from "vitest";
import {
	buildNativeCallbackHandoffPath,
	decodeNativeCallbackTarget,
	encodeNativeCallbackTarget,
	validateNativeCallbackHandoffTarget,
} from "../oauth-native-handoff.server";

const WARP_CALLBACK =
	"warp://mcp/oauth2callback?code=abc123&state=xyz&iss=https%3A%2F%2Fration.mayutic.com%2Fapi%2Fauth";

describe("native callback handoff encoding", () => {
	it("round-trips warp callback URLs", () => {
		const encoded = encodeNativeCallbackTarget(WARP_CALLBACK);
		expect(decodeNativeCallbackTarget(encoded)).toBe(WARP_CALLBACK);
		expect(buildNativeCallbackHandoffPath(WARP_CALLBACK)).toMatch(
			/^\/oauth\/return\?to=/,
		);
	});
});

describe("validateNativeCallbackHandoffTarget", () => {
	it("accepts warp callbacks with authorization codes", () => {
		expect(validateNativeCallbackHandoffTarget(WARP_CALLBACK)).toBe(
			WARP_CALLBACK,
		);
	});

	it("rejects callbacks without codes", () => {
		expect(
			validateNativeCallbackHandoffTarget(
				"warp://mcp/oauth2callback?state=xyz",
			),
		).toBeNull();
	});
});
