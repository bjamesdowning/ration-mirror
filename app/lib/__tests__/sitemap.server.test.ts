import { describe, expect, it } from "vitest";
import { getAllPosts } from "~/lib/blog.server";
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
});
