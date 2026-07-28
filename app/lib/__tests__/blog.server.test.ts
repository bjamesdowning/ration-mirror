import { describe, expect, it } from "vitest";
import {
	extractFaqFromMarkdown,
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

describe("extractFaqFromMarkdown", () => {
	it("returns empty when there is no FAQ section", () => {
		expect(extractFaqFromMarkdown("# Hello\n\nNo faq here.")).toEqual([]);
	});

	it("parses bold questions and strips markdown from answers", () => {
		const md = `## Intro

Text.

## FAQ

**What is a pantry app?**

A pantry app tracks [inventory](/blog/x) and expiry.

**Do I need three apps?**

No. You need three *jobs*, not three apps.

## Next section

More.
`;
		const faq = extractFaqFromMarkdown(md);
		expect(faq).toEqual([
			{
				question: "What is a pantry app?",
				answer: "A pantry app tracks inventory and expiry.",
			},
			{
				question: "Do I need three apps?",
				answer: "No. You need three jobs, not three apps.",
			},
		]);
	});

	it("loads FAQ entries from the category comparison post", () => {
		const post = getPostBySlug("pantry-app-vs-recipe-manager-vs-meal-planner");
		expect(post).not.toBeNull();
		expect(post?.faq.length).toBeGreaterThanOrEqual(5);
		expect(post?.faq[0]?.question).toMatch(/pantry app/i);
	});
});

describe("getPostBySlug", () => {
	it("returns enriched SEO metadata for blog posts", () => {
		const post = getPostBySlug("mcp-kitchen-assistant");

		expect(post).not.toBeNull();
		expect(post?.date).toBe("2026-03-10");
		expect(post?.dateModified).toBe("2026-03-21");
		expect(post?.authorName).toBe("Ration");
		expect(post?.authorUrl).toBeUndefined();
		expect(post?.image).toBe("/static/ration-logo.svg");
		expect(post?.tags).toContain("MCP");
		expect(post?.tags).toContain("meal planning");
	});

	it("parses FAQ from agent-first onboarding post", () => {
		const post = getPostBySlug("agent-first-mcp-onboarding");
		expect(post?.faq.length).toBeGreaterThanOrEqual(4);
		expect(post?.faq.some((e) => /claim/i.test(e.question))).toBe(true);
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
