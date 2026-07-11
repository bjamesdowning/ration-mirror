import { describe, expect, it } from "vitest";
import { MAGIC_LINK_VERIFY_PARAMS } from "~/lib/magic-link-interstitial.server";

describe("MAGIC_LINK_VERIFY_PARAMS", () => {
	it("includes all Better Auth verify query keys", () => {
		expect(MAGIC_LINK_VERIFY_PARAMS).toEqual([
			"token",
			"callbackURL",
			"newUserCallbackURL",
			"errorCallbackURL",
		]);
	});
});
