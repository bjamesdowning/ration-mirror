/**
 * SEO constants and helpers for Open Graph and Twitter cards.
 * Canonical/OG URLs use production origin — shared links resolve to production.
 */
export const SITE_ORIGIN = "https://ration.mayutic.com";

export const OG_IMAGE = `${SITE_ORIGIN}/static/ration-logo.svg`;

export type SeoMeta = {
	title: string;
	description: string;
	path: string;
};

/** Returns meta descriptors for Open Graph and Twitter cards. */
export function ogMeta({ title, description, path }: SeoMeta) {
	const url = `${SITE_ORIGIN}${path}`;
	return [
		{ property: "og:type", content: "website" },
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
		{ property: "og:url", content: url },
		{ property: "og:image", content: OG_IMAGE },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: title },
		{ name: "twitter:description", content: description },
		{ name: "twitter:image", content: OG_IMAGE },
	];
}
