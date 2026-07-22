import { describe, expect, it } from "vitest";
import { getMatchCacheKey } from "../matching.server";
import {
	manifestReadyCacheVersionKey,
	matchCacheVersionKey,
} from "../readiness-cache.server";

describe("readiness cache versioning", () => {
	it("namespaces match and manifest-ready version keys by org", () => {
		expect(matchCacheVersionKey("org-1")).toBe("match:ver:org-1");
		expect(manifestReadyCacheVersionKey("org-1")).toBe(
			"manifest-ready:ver:org-1",
		);
	});

	it("includes version in getMatchCacheKey so bumps invalidate", () => {
		const base = {
			mode: "strict" as const,
			minMatch: 50,
			limit: 20,
		};
		const keyA = getMatchCacheKey("org-1", base, "0");
		const keyB = getMatchCacheKey("org-1", base, "1710000000000");
		expect(keyA).toContain(":v0:");
		expect(keyB).toContain(":v1710000000000:");
		expect(keyA).not.toBe(keyB);
	});
});
