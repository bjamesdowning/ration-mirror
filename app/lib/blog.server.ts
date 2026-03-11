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
