import { describe, expect, it } from "vitest";
import { createMockEnv } from "~/test/helpers/mock-env";
import { getClientSafeFlags } from "../flags.server";

describe("getClientSafeFlags (empty registry at ship)", () => {
	it("returns an empty object", async () => {
		const env = createMockEnv();
		const result = await getClientSafeFlags(env, { country: "US" });
		expect(result).toEqual({});
	});
});
