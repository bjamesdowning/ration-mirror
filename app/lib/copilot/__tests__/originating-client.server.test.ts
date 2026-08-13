import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../../version";
import {
	inferCopilotAuthSource,
	resolveCopilotOriginatingClient,
} from "../originating-client.server";

describe("inferCopilotAuthSource", () => {
	it("treats a Bearer token as mobile", () => {
		const request = new Request("https://copilot.ration.mayutic.com/copilot", {
			headers: { Authorization: "Bearer mobile-jwt" },
		});
		expect(inferCopilotAuthSource(request)).toBe("mobile");
	});

	it("treats handshake/cookie Ask as web", () => {
		const request = new Request(
			"https://copilot.ration.mayutic.com/copilot?handshakeToken=abc",
		);
		expect(inferCopilotAuthSource(request)).toBe("web");
	});

	it("does not treat an empty Bearer as mobile", () => {
		const request = new Request("https://copilot.ration.mayutic.com/copilot", {
			headers: { Authorization: "Bearer " },
		});
		expect(inferCopilotAuthSource(request)).toBe("web");
	});
});

describe("resolveCopilotOriginatingClient", () => {
	it("forces web + APP_VERSION and ignores a spoofed iOS header", () => {
		const request = new Request("https://copilot.ration.mayutic.com/copilot", {
			headers: { "X-Ration-Client": "ios/1.4.26" },
		});
		expect(resolveCopilotOriginatingClient(request, "web")).toEqual({
			clientPlatform: "web",
			clientVersion: APP_VERSION,
		});
	});

	it("uses iOS marketing version from X-Ration-Client on mobile Ask", () => {
		const request = new Request("https://copilot.ration.mayutic.com/copilot", {
			headers: {
				Authorization: "Bearer mobile-jwt",
				"X-Ration-Client": "ios/1.4.26",
			},
		});
		expect(resolveCopilotOriginatingClient(request, "mobile")).toEqual({
			clientPlatform: "ios",
			clientVersion: "1.4.26",
		});
	});

	it("omits clientVersion when mobile Ask has no iOS header", () => {
		const request = new Request("https://copilot.ration.mayutic.com/copilot", {
			headers: { Authorization: "Bearer mobile-jwt" },
		});
		expect(resolveCopilotOriginatingClient(request, "mobile")).toEqual({
			clientPlatform: "ios",
		});
	});

	it("omits clientVersion when mobile header is not ios/mobile", () => {
		const request = new Request("https://copilot.ration.mayutic.com/copilot", {
			headers: {
				Authorization: "Bearer mobile-jwt",
				"X-Ration-Client": "web/1.8.48",
			},
		});
		expect(resolveCopilotOriginatingClient(request, "mobile")).toEqual({
			clientPlatform: "ios",
		});
	});
});
