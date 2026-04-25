/**
 * SEO constants and helpers for Open Graph and Twitter cards.
 * Canonical/OG URLs use production origin — shared links resolve to production.
 */
export const SITE_ORIGIN = "https://ration.mayutic.com";

/**
 * Sitewide default Open Graph image. Many social previewers and AI answer
 * cards do not reliably render SVG, so the long-term target is a 1200x630
 * PNG at `/static/og/og-default.png`. Until that asset is generated and
 * dropped in (see `public/static/og/README.md`), `OG_IMAGE` continues to
 * point at the existing SVG logo so previews still resolve.
 *
 * Switch this constant to `OG_IMAGE_PNG` once the PNG ships.
 */
export const OG_IMAGE_PNG = `${SITE_ORIGIN}/static/og/og-default.png`;
export const OG_IMAGE = `${SITE_ORIGIN}/static/ration-logo.svg`;

export type SeoMeta = {
	title: string;
	description: string;
	path: string;
	image?: string;
	type?: "website" | "article";
	publishedTime?: string;
	modifiedTime?: string;
	tags?: string[];
};

export function absoluteSiteUrl(pathOrUrl: string) {
	if (/^https?:\/\//.test(pathOrUrl)) {
		return pathOrUrl;
	}

	return pathOrUrl.startsWith("/")
		? `${SITE_ORIGIN}${pathOrUrl}`
		: `${SITE_ORIGIN}/${pathOrUrl}`;
}

/** Returns a canonical descriptor that React Router can render in <Meta />. */
export function canonicalMeta(path: string) {
	return {
		tagName: "link" as const,
		rel: "canonical",
		href: absoluteSiteUrl(path),
	};
}

/** Returns meta descriptors for Open Graph and Twitter cards. */
export function ogMeta({
	title,
	description,
	path,
	image = OG_IMAGE,
	type = "website",
	publishedTime,
	modifiedTime,
	tags = [],
}: SeoMeta) {
	const url = absoluteSiteUrl(path);
	const imageUrl = absoluteSiteUrl(image);
	const descriptors = [
		{ property: "og:type", content: type },
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
		{ property: "og:url", content: url },
		{ property: "og:image", content: imageUrl },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: title },
		{ name: "twitter:description", content: description },
		{ name: "twitter:image", content: imageUrl },
	];

	if (type === "article") {
		if (publishedTime) {
			descriptors.push({
				property: "article:published_time",
				content: publishedTime,
			});
		}
		if (modifiedTime) {
			descriptors.push({
				property: "article:modified_time",
				content: modifiedTime,
			});
		}
		for (const tag of tags) {
			descriptors.push({ property: "article:tag", content: tag });
		}
	}

	return descriptors;
}
