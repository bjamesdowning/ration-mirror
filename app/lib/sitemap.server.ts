import { getAllPosts } from "./blog.server";
import { HELP_ARTICLES } from "./help/articles";

export type SitemapEntry = {
	path: string;
	lastmod: string;
};

/**
 * Static indexable pages and their last-modified date. Bump `lastmod` when page
 * content changes meaningfully so crawlers know to revisit.
 */
const STATIC_PAGES: ReadonlyArray<SitemapEntry> = [
	{ path: "/", lastmod: "2026-07-10" },
	{ path: "/about", lastmod: "2026-04-25" },
	{ path: "/help", lastmod: "2026-07-17" },
	{ path: "/connect", lastmod: "2026-06-19" },
	{ path: "/docs/api", lastmod: "2026-06-19" },
	{ path: "/tools", lastmod: "2026-04-25" },
	{ path: "/tools/unit-converter", lastmod: "2026-04-25" },
	{ path: "/legal/terms", lastmod: "2026-07-15" },
	{ path: "/legal/privacy", lastmod: "2026-07-15" },
	{ path: "/auth.md", lastmod: "2026-06-19" },
	{ path: "/mcp.md", lastmod: "2026-06-19" },
];

function maxDate(dates: string[]): string {
	if (dates.length === 0) return new Date().toISOString().slice(0, 10);
	return dates.reduce((latest, date) => (date > latest ? date : latest));
}

/** Returns every indexable URL for sitemap.xml (static pages + all blog posts). */
export function getSitemapEntries(): SitemapEntry[] {
	const posts = getAllPosts();
	const blogLastmod = maxDate(posts.map((post) => post.dateModified));
	const helpLastmod = "2026-07-17";

	const staticEntries: SitemapEntry[] = [
		...STATIC_PAGES,
		{ path: "/blog", lastmod: blogLastmod },
	];

	const blogEntries: SitemapEntry[] = posts.map((post) => ({
		path: `/blog/${post.slug}`,
		lastmod: post.dateModified,
	}));

	const helpEntries: SitemapEntry[] = HELP_ARTICLES.map((article) => ({
		path: `/help/${article.slug}`,
		lastmod: helpLastmod,
	}));

	return [...staticEntries, ...blogEntries, ...helpEntries];
}

export function renderSitemapXml(
	origin: string,
	entries: SitemapEntry[],
): string {
	const urls = entries
		.map(
			({ path, lastmod }) =>
				`  <url><loc>${origin}${path}</loc><lastmod>${lastmod}</lastmod></url>`,
		)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}
