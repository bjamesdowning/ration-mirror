import { describe, expect, it, vi } from "vitest";
import { createMockEnv, createMockFlagship } from "~/test/helpers/mock-env";
import { buildMobileFlagContext } from "../context.server";
import { getClientSafeFlags } from "../flags.server";

describe("share extension client lanes", () => {
	it("turns shipped import lanes on for a versioned iOS client and leaves them off without a version", async () => {
		const getBooleanValue = vi.fn().mockResolvedValue(false);
		const env = {
			...createMockEnv(),
			RATION_ENV: "production",
			FLAGS: createMockFlagship({ getBooleanValue }),
		};

		const versioned = await getClientSafeFlags(
			env,
			buildMobileFlagContext(
				new Request("https://ration.mayutic.com/api/mobile/v1/session", {
					headers: {
						"X-Ration-Client": "ios/1.6.10",
						"X-Ration-Surface": "share-extension",
					},
				}),
				env,
			),
		);
		expect(versioned.aiImportUrl).toBe(true);
		expect(versioned.aiImportWeb).toBe(true);
		expect(versioned.aiImportSocial).toBe(true);
		expect(versioned.shareExtensionImport).toBe(false);
		expect(getBooleanValue).not.toHaveBeenCalledWith(
			"ai-import-url",
			false,
			expect.anything(),
		);
		expect(getBooleanValue).not.toHaveBeenCalledWith(
			"ai-import-web",
			false,
			expect.anything(),
		);
		expect(getBooleanValue).not.toHaveBeenCalledWith(
			"ai-import-social",
			false,
			expect.anything(),
		);
		expect(getBooleanValue).toHaveBeenCalledWith(
			"share-extension-import",
			false,
			expect.objectContaining({
				clientPlatform: "ios",
				clientVersion: "1.6.10",
			}),
		);

		getBooleanValue.mockClear();
		const missingHeader = await getClientSafeFlags(
			env,
			buildMobileFlagContext(
				new Request("https://ration.mayutic.com/api/mobile/v1/session", {
					headers: { "X-Ration-Surface": "share-extension" },
				}),
				env,
			),
		);
		const barePlatform = await getClientSafeFlags(
			env,
			buildMobileFlagContext(
				new Request("https://ration.mayutic.com/api/mobile/v1/session", {
					headers: {
						"X-Ration-Client": "ios",
						"X-Ration-Surface": "share-extension",
					},
				}),
				env,
			),
		);
		for (const off of [missingHeader, barePlatform]) {
			expect(off.aiImportUrl).toBe(false);
			expect(off.aiImportWeb).toBe(false);
			expect(off.aiImportSocial).toBe(false);
			expect(off.shareExtensionImport).toBe(false);
		}
		expect(getBooleanValue).toHaveBeenCalledWith(
			"ai-import-url",
			false,
			expect.objectContaining({ clientPlatform: "ios" }),
		);
		expect(getBooleanValue).toHaveBeenCalledWith(
			"ai-import-web",
			false,
			expect.anything(),
		);
		expect(getBooleanValue).toHaveBeenCalledWith(
			"ai-import-social",
			false,
			expect.anything(),
		);
	});
});
