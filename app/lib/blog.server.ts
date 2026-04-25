import matter from "gray-matter";
import { OG_IMAGE } from "./seo";

export type BlogPost = {
	slug: string;
	title: string;
	description: string;
	date: string;
	dateModified: string;
	authorName: string;
	authorUrl?: string;
	image: string;
	tags: string[];
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

export function normalizeBlogDate(value: unknown): string {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
			return trimmed;
		}

		const parsed = new Date(trimmed);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed.toISOString().slice(0, 10);
		}
	}

	return new Date().toISOString().slice(0, 10);
}

function normalizeBlogImage(value: unknown): string {
	if (typeof value === "string" && value.trim().length > 0) {
		return value.trim();
	}

	return OG_IMAGE;
}

function normalizeBlogTags(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.filter((tag): tag is string => typeof tag === "string")
		.map((tag) => tag.trim())
		.filter(Boolean);
}

function parsePost(path: string, raw: string): BlogPost {
	const { data, content } = matter(raw);
	const slug = (data.slug as string) || slugFromPath(path);
	const publishedDate = normalizeBlogDate(data.date);
	return {
		slug,
		title: (data.title as string) || "Untitled",
		description: (data.description as string) || "",
		date: publishedDate,
		dateModified: normalizeBlogDate(data.dateModified ?? publishedDate),
		authorName: (data.authorName as string) || "Billy Downing",
		authorUrl:
			typeof data.authorUrl === "string" && data.authorUrl.trim().length > 0
				? data.authorUrl.trim()
				: undefined,
		image: normalizeBlogImage(data.image),
		tags: normalizeBlogTags(data.tags),
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

/**
 * Returns up to `count` posts most relevant to the given slug, ranked by
 * tag overlap (descending), then recency (descending). The source post is
 * never included. If fewer than `count` posts exist, returns whatever is
 * available — callers should treat the result as "best effort".
 *
 * Pure function (no I/O); the underlying `getAllPosts()` cache is only hit
 * once per worker isolate.
 */
export function getRelatedPosts(slug: string, count: number): BlogPost[] {
	if (count <= 0) return [];
	const all = getAllPosts();
	const source = all.find((p) => p.slug === slug);
	if (!source) return [];

	const sourceTags = new Set(source.tags);
	const candidates = all.filter((p) => p.slug !== slug);

	const ranked = candidates
		.map((p) => ({
			post: p,
			overlap: p.tags.reduce((n, t) => (sourceTags.has(t) ? n + 1 : n), 0),
		}))
		.sort((a, b) => {
			if (b.overlap !== a.overlap) return b.overlap - a.overlap;
			return a.post.date > b.post.date ? -1 : 1;
		});

	return ranked.slice(0, count).map((r) => r.post);
}

/** Returns the N most recent posts. Used for the homepage "latest posts" rail. */
export function getRecentPosts(count: number): BlogPost[] {
	if (count <= 0) return [];
	return getAllPosts().slice(0, count);
}
