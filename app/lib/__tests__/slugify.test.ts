import { describe, expect, it } from "vitest";
import {
	ensureUniqueSlug,
	fallbackSlug,
	resolveGroupSlugFromName,
	resolveTagSlugFromName,
	slugifyDisplayName,
} from "~/lib/slugify";

describe("slugifyDisplayName", () => {
	it("converts spaces and casing to hyphenated lowercase", () => {
		expect(slugifyDisplayName("Home Kitchen")).toBe("home-kitchen");
		expect(slugifyDisplayName("  Space Station 1  ")).toBe("space-station-1");
	});

	it("strips invalid characters", () => {
		expect(slugifyDisplayName("Tom's Pantry!")).toBe("toms-pantry");
	});

	it("returns empty for emoji-only input", () => {
		expect(slugifyDisplayName("🚀")).toBe("");
	});

	it("respects max length", () => {
		expect(slugifyDisplayName("a very long group name here", 10)).toBe(
			"a-very-lon",
		);
	});
});

describe("ensureUniqueSlug", () => {
	it("returns base when available", async () => {
		const slug = await ensureUniqueSlug("home", async () => false);
		expect(slug).toBe("home");
	});

	it("appends numeric suffix on collision", async () => {
		const taken = new Set(["home", "home-2"]);
		const slug = await ensureUniqueSlug("home", async (s) => taken.has(s));
		expect(slug).toBe("home-3");
	});
});

describe("resolveGroupSlugFromName", () => {
	it("uses fallback when name slugifies to empty", async () => {
		const slug = await resolveGroupSlugFromName("🚀", async () => false);
		expect(slug).toMatch(/^group-[a-z0-9]{6}$/);
	});
});

describe("resolveTagSlugFromName", () => {
	it("respects tag max length", async () => {
		const slug = await resolveTagSlugFromName(
			"Organic Produce Section",
			12,
			async () => false,
		);
		expect(slug.length).toBeLessThanOrEqual(12);
	});
});

describe("fallbackSlug", () => {
	it("generates prefixed random slugs", () => {
		expect(fallbackSlug("tag")).toMatch(/^tag-[a-z0-9]{6}$/);
	});
});
