import matter from "gray-matter";

export type BlogPost = {
	slug: string;
	title: string;
	description: string;
	date: string;
	content: string;
};

// Vite bundles these at build time; raw string is the default export
const BLOG_GLOB = import.meta.glob<string>("../../content/blog/*.md", {
	query: "?raw",
	import: "default",
	eager: true,
});

function slugFromPath(filePath: string): string {
	const match = filePath.match(/blog\/(.+)\.md$/);
	return match ? match[1] : filePath;
}

function parsePost(path: string, raw: string): BlogPost {
	const { data, content } = matter(raw);
	const slug = (data.slug as string) || slugFromPath(path);
	return {
		slug,
		title: (data.title as string) || "Untitled",
		description: (data.description as string) || "",
		date: (data.date as string) || new Date().toISOString().slice(0, 10),
		content,
	};
}

let cachedPosts: BlogPost[] | null = null;

/** Returns all blog posts, sorted by date descending. */
export function getAllPosts(): BlogPost[] {
	if (cachedPosts) return cachedPosts;
	const entries = Object.entries(BLOG_GLOB);
	const posts = entries.map(([path, raw]) => parsePost(path, raw ?? ""));
	posts.sort((a, b) => (a.date > b.date ? -1 : 1));
	cachedPosts = posts;
	return posts;
}

/** Returns a single post by slug, or null if not found. */
export function getPostBySlug(slug: string): BlogPost | null {
	return getAllPosts().find((p) => p.slug === slug) ?? null;
}

/** Returns all post slugs for sitemap. */
export function getAllSlugs(): string[] {
	return getAllPosts().map((p) => p.slug);
}
