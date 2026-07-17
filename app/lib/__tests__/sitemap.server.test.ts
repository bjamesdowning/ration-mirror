import { describe, expect, it } from "vitest";
import { getAllPosts } from "~/lib/blog.server";
import { HELP_ARTICLES } from "~/lib/help/articles";
import { getSitemapEntries } from "~/lib/sitemap.server";

describe("getSitemapEntries", () => {
	it("includes every published blog post", () => {
		const posts = getAllPosts();
		const entries = getSitemapEntries();
		const blogPaths = entries
			.filter((entry) => entry.path.startsWith("/blog/"))
			.map((entry) => entry.path);

		expect(blogPaths).toHaveLength(posts.length);
		for (const post of posts) {
			expect(blogPaths).toContain(`/blog/${post.slug}`);
		}
	});

	it("includes core public marketing and discovery pages", () => {
		const paths = getSitemapEntries().map((entry) => entry.path);

		expect(paths).toEqual(
			expect.arrayContaining([
				"/",
				"/about",
				"/help",
				"/blog",
				"/connect",
				"/docs/api",
				"/tools",
				"/tools/unit-converter",
				"/legal/terms",
				"/legal/privacy",
				"/auth.md",
				"/mcp.md",
			]),
		);
	});

	it("includes every help article under /help/:slug", () => {
		const paths = getSitemapEntries().map((entry) => entry.path);
		for (const article of HELP_ARTICLES) {
			expect(paths).toContain(`/help/${article.slug}`);
		}
	});

	it("sets /blog lastmod to the newest post dateModified", () => {
		const posts = getAllPosts();
		const newest = posts.reduce(
			(latest, post) =>
				post.dateModified > latest ? post.dateModified : latest,
			posts[0]?.dateModified ?? "",
		);
		const blogEntry = getSitemapEntries().find(
			(entry) => entry.path === "/blog",
		);

		expect(blogEntry?.lastmod).toBe(newest);
	});

	it("uses YYYY-MM-DD lastmod for every entry", () => {
		for (const entry of getSitemapEntries()) {
			expect(entry.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it("marks the remodeled home page with its current revision date", () => {
		expect(
			getSitemapEntries().find((entry) => entry.path === "/")?.lastmod,
		).toBe("2026-07-10");
	});
});
