/** Shared slug derivation for groups, tags, and other named entities. */

const DEFAULT_MAX_SLUG_LENGTH = 100;

/**
 * Convert a display name to a URL-safe slug: lowercase, hyphens, alphanumeric only.
 */
export function slugifyDisplayName(
	input: string,
	maxLength = DEFAULT_MAX_SLUG_LENGTH,
): string {
	let slug = "";
	let previousHyphen = false;

	for (const character of input.trim().toLowerCase()) {
		if (
			(character >= "a" && character <= "z") ||
			(character >= "0" && character <= "9")
		) {
			slug += character;
			previousHyphen = false;
		} else if (character === " " || character === "-" || character === "_") {
			if (slug.length > 0 && !previousHyphen) {
				slug += "-";
				previousHyphen = true;
			}
		}
	}

	while (slug.endsWith("-")) {
		slug = slug.slice(0, -1);
	}

	if (maxLength > 0 && slug.length > maxLength) {
		slug = slug.slice(0, maxLength).replace(/-+$/, "");
	}

	return slug;
}

function randomSlugSuffix(length = 6): string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	for (const byte of bytes) {
		result += alphabet[byte % alphabet.length];
	}
	return result;
}

/**
 * Resolve a unique slug by appending -2, -3, … when `base` is taken.
 */
export async function ensureUniqueSlug(
	base: string,
	isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
	const normalizedBase = base || "item";
	let candidate = normalizedBase;
	let attempt = 1;

	while (await isTaken(candidate)) {
		attempt += 1;
		candidate = `${normalizedBase}-${attempt}`;
	}

	return candidate;
}

/** Fallback when slugify yields empty (e.g. emoji-only names). */
export function fallbackSlug(prefix: "group" | "tag"): string {
	return `${prefix}-${randomSlugSuffix()}`;
}

export async function resolveGroupSlugFromName(
	name: string,
	isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
	const base = slugifyDisplayName(name) || fallbackSlug("group");
	return ensureUniqueSlug(base, isTaken);
}

export async function resolveTagSlugFromName(
	name: string,
	maxLength: number,
	isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
	const base = slugifyDisplayName(name, maxLength) || fallbackSlug("tag");
	return ensureUniqueSlug(base, isTaken);
}
