/** Client-safe tag utilities and shared types. */

import { slugifyDisplayName } from "~/lib/slugify";

export const MAX_TAGS_PER_ENTITY = 10;
export const MAX_TAG_SLUG_LENGTH = 50;
export const TAG_SLUG_PATTERN = /^[a-z0-9-]+$/;
export const TAG_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
export const MAX_TAG_CATEGORY_LENGTH = 50;

export type TagRecord = {
	id: string;
	slug: string;
	name: string;
	color?: string | null;
	category?: string | null;
};

export type TagWithCounts = TagRecord & {
	cargoCount: number;
	mealCount: number;
};

/** Normalize user input to a canonical tag slug. */
export function normalizeTagSlug(input: string): string {
	return slugifyDisplayName(input, MAX_TAG_SLUG_LENGTH);
}

/** Default display name from slug (title-case words). */
export function formatTagName(slug: string): string {
	if (!slug) return "";
	return slug
		.split("-")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export function isValidTagSlug(slug: string): boolean {
	return (
		slug.length >= 1 &&
		slug.length <= MAX_TAG_SLUG_LENGTH &&
		TAG_SLUG_PATTERN.test(slug)
	);
}

/** Safe hex color for inline styles; rejects CSS injection. */
export function sanitizeTagColor(
	color: string | null | undefined,
): string | null {
	if (!color) return null;
	return TAG_COLOR_PATTERN.test(color) ? color : null;
}

/** Dedupe slugs preserving first-seen order. */
export function dedupeTagSlugs(slugs: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of slugs) {
		const slug = normalizeTagSlug(raw);
		if (!slug || !isValidTagSlug(slug) || seen.has(slug)) continue;
		seen.add(slug);
		result.push(slug);
		if (result.length >= MAX_TAGS_PER_ENTITY) break;
	}
	return result;
}

/** Parse comma-separated or array tag input from forms. */
export function parseTagSlugsInput(input: unknown): string[] {
	if (Array.isArray(input)) {
		return dedupeTagSlugs(
			input.filter((v): v is string => typeof v === "string"),
		);
	}
	if (typeof input === "string") {
		return dedupeTagSlugs(input.split(","));
	}
	return [];
}

/** Build filter URL param from slug list. */
export function tagsToSearchParam(tags: string[]): string {
	return dedupeTagSlugs(tags).join(",");
}

/** Normalize legacy string tags or TagRecord[] down to slug strings. */
export function toTagSlugs(tags: TagRecord[] | string[] | undefined): string[] {
	if (!tags?.length) return [];
	return tags.map((tag) => (typeof tag === "string" ? tag : tag.slug));
}

/** Normalize legacy string tags or TagRecord[] for display. */
export function toTagRecords(
	tags: TagRecord[] | string[] | undefined,
): TagRecord[] {
	if (!tags?.length) return [];
	if (typeof tags[0] === "string") {
		return (tags as string[]).map((slug) => ({
			id: slug,
			slug,
			name: formatTagName(slug),
		}));
	}
	return tags as TagRecord[];
}

export function tagsFromSearchParam(param: string | null): string[] {
	if (!param) return [];
	return dedupeTagSlugs(param.split(","));
}
