import { describe, expect, it } from "vitest";
import {
	getAllPosts,
	getPostBySlug,
	getRecentPosts,
	getRelatedPosts,
	normalizeBlogDate,
} from "~/lib/blog.server";

describe("normalizeBlogDate", () => {
	it("keeps ISO date strings unchanged", () => {
		expect(normalizeBlogDate("2026-03-10")).toBe("2026-03-10");
	});

	it("converts Date objects to sitemap-safe YYYY-MM-DD strings", () => {
		expect(normalizeBlogDate(new Date("2026-03-10T00:00:00.000Z"))).toBe(
			"2026-03-10",
		);
	});

	it("parses non-ISO date strings into YYYY-MM-DD", () => {
		expect(normalizeBlogDate("Tue Mar 10 2026 00:00:00 GMT+0000")).toBe(
			"2026-03-10",
		);
	});
});

describe("getPostBySlug", () => {
	it("returns enriched SEO metadata for blog posts", () => {
		const post = getPostBySlug("mcp-kitchen-assistant");

		expect(post).not.toBeNull();
		expect(post?.date).toBe("2026-03-10");
		expect(post?.dateModified).toBe("2026-03-21");
		expect(post?.authorName).toBe("Billy Downing");
		expect(post?.authorUrl).toBe("https://linkedin.com/in/billy-downing");
		expect(post?.image).toBe("/static/ration-logo.svg");
		expect(post?.tags).toContain("MCP");
		expect(post?.tags).toContain("meal planning");
	});
});

describe("getRelatedPosts", () => {
	it("never includes the source post in the result", () => {
		const all = getAllPosts();
		const source = all[0];
		const related = getRelatedPosts(source.slug, 10);
		expect(related.find((p) => p.slug === source.slug)).toBeUndefined();
	});

	it("returns up to `count` posts", () => {
		const related = getRelatedPosts("mcp-kitchen-assistant", 2);
		expect(related.length).toBeLessThanOrEqual(2);
	});

	it("returns an empty array when count <= 0", () => {
		expect(getRelatedPosts("mcp-kitchen-assistant", 0)).toEqual([]);
		expect(getRelatedPosts("mcp-kitchen-assistant", -1)).toEqual([]);
	});

	it("returns an empty array for an unknown slug", () => {
		expect(getRelatedPosts("does-not-exist", 3)).toEqual([]);
	});

	it("ranks posts with more shared tags ahead of fewer", () => {
		const all = getAllPosts();
		const source = all[0];
		const related = getRelatedPosts(source.slug, all.length - 1);
		const sourceTags = new Set(source.tags);
		const overlaps = related.map((p) =>
			p.tags.reduce((n, t) => (sourceTags.has(t) ? n + 1 : n), 0),
		);
		// Overlaps should be in non-increasing order.
		for (let i = 0; i < overlaps.length - 1; i++) {
			expect(overlaps[i]).toBeGreaterThanOrEqual(overlaps[i + 1]);
		}
	});

	it("falls back to recency for posts with equal tag overlap", () => {
		const all = getAllPosts();
		// Find a post and compare two related candidates with equal overlap
		const related = getRelatedPosts(all[0].slug, all.length - 1);
		const sourceTags = new Set(all[0].tags);
		const sameOverlap = related.filter(
			(p) => p.tags.reduce((n, t) => (sourceTags.has(t) ? n + 1 : n), 0) === 0,
		);
		// For posts tied on overlap, dates should be in non-increasing order.
		for (let i = 0; i < sameOverlap.length - 1; i++) {
			expect(sameOverlap[i].date >= sameOverlap[i + 1].date).toBe(true);
		}
	});
});

describe("getRecentPosts", () => {
	it("returns the N most recent posts in date-descending order", () => {
		const all = getAllPosts();
		const recent = getRecentPosts(all.length);
		expect(recent).toHaveLength(all.length);
		for (let i = 0; i < recent.length - 1; i++) {
			expect(recent[i].date >= recent[i + 1].date).toBe(true);
		}
	});

	it("clamps to available posts when count exceeds total", () => {
		const all = getAllPosts();
		const recent = getRecentPosts(all.length + 100);
		expect(recent).toHaveLength(all.length);
	});

	it("returns an empty array when count <= 0", () => {
		expect(getRecentPosts(0)).toEqual([]);
		expect(getRecentPosts(-5)).toEqual([]);
	});
});
