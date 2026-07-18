import { describe, expect, it } from "vitest";
import { isBlockedImportUrl } from "../recipe-import-submit.server";

describe("isBlockedImportUrl", () => {
	it("blocks known metadata hostnames", () => {
		expect(isBlockedImportUrl("http://169.254.169.254/latest/meta-data")).toBe(
			true,
		);
	});

	it("blocks private IPv4 ranges", () => {
		expect(isBlockedImportUrl("http://127.0.0.1/admin")).toBe(true);
		expect(isBlockedImportUrl("http://10.0.0.1/internal")).toBe(true);
		expect(isBlockedImportUrl("http://192.168.1.1/router")).toBe(true);
		expect(isBlockedImportUrl("http://172.16.0.1/internal")).toBe(true);
	});

	it("allows public recipe URLs", () => {
		expect(isBlockedImportUrl("https://example.com/recipe")).toBe(false);
	});

	it("blocks loopback final URL after redirect (SSRF re-check contract)", () => {
		const redirectedFinalUrl = "http://127.0.0.1/after-redirect";
		expect(isBlockedImportUrl(redirectedFinalUrl)).toBe(true);
	});

	it("blocks localhost and link-local hosts", () => {
		expect(isBlockedImportUrl("https://localhost/recipe")).toBe(true);
		expect(isBlockedImportUrl("https://169.254.1.1/recipe")).toBe(true);
	});
});
