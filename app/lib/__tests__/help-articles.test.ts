import { describe, expect, it } from "vitest";
import {
	getHelpArticleMeta,
	HELP_ARTICLES,
	isHelpArticleSlug,
} from "~/lib/help/articles";
import {
	getHelpArticle,
	getHelpDirectoryMarkdown,
	listHelpArticleSlugs,
} from "~/lib/help/help.server";

describe("help article allowlist", () => {
	it("rejects maintainer-only and unknown slugs", () => {
		expect(isHelpArticleSlug("README")).toBe(false);
		expect(isHelpArticleSlug("INDEX")).toBe(false);
		expect(isHelpArticleSlug("QA-CHECKLIST")).toBe(false);
		expect(isHelpArticleSlug("DIRECTORY")).toBe(false);
		expect(isHelpArticleSlug("70-copilot-chat-capability-roadmap")).toBe(false);
		expect(isHelpArticleSlug("not-a-real-article")).toBe(false);
	});

	it("accepts every registered customer article", () => {
		for (const article of HELP_ARTICLES) {
			expect(isHelpArticleSlug(article.slug)).toBe(true);
			expect(getHelpArticleMeta(article.slug)?.title).toBe(article.title);
		}
	});

	it("loads DIRECTORY.md and every allowlisted article body", () => {
		expect(getHelpDirectoryMarkdown()).toMatch(/Ration user guide/);
		const slugs = listHelpArticleSlugs();
		expect(slugs.length).toBe(HELP_ARTICLES.length);
		for (const article of HELP_ARTICLES) {
			const loaded = getHelpArticle(article.slug);
			expect(loaded).not.toBeNull();
			expect(loaded?.content.length).toBeGreaterThan(40);
			expect(loaded?.slug).toBe(article.slug);
		}
	});

	it("returns null for non-allowlisted slugs even if a file exists", () => {
		expect(getHelpArticle("DIRECTORY")).toBeNull();
		expect(getHelpArticle("70-copilot-chat-capability-roadmap")).toBeNull();
	});
});
