/**
 * Schema.org JSON-LD builders.
 *
 * These functions produce plain objects ready for `JSON.stringify` inside a
 * `<script type="application/ld+json">` tag. Builders are pure: same input
 * always returns the same output, no side effects, no I/O. This keeps them
 * trivially testable and safe to call from React Router meta functions or
 * route components.
 *
 * All schemas reference the production `SITE_ORIGIN` so they remain stable
 * regardless of which environment renders them — search engines and AI
 * answer engines should always see the canonical production URL.
 */

import { absoluteSiteUrl, OG_IMAGE, SITE_ORIGIN } from "./seo";

/* -------------------------------------------------------------------------- */
/* Shared types                                                               */
/* -------------------------------------------------------------------------- */

export type Crumb = { name: string; path: string };

export type FaqEntry = { question: string; answer: string };

export type AuthorInput = {
	name: string;
	url?: string;
	jobTitle?: string;
	sameAs?: string[];
};

export type ArticleInput = {
	slug: string;
	title: string;
	description: string;
	datePublished: string;
	dateModified: string;
	image: string;
	tags: string[];
	author: AuthorInput;
};

export type SoftwareOffer = {
	name: string;
	price: string;
	priceCurrency: string;
	description?: string;
};

/* -------------------------------------------------------------------------- */
/* Identity / publisher schemas                                               */
/* -------------------------------------------------------------------------- */

const PUBLISHER_LOGO = `${SITE_ORIGIN}/static/ration-logo.svg`;

/** Organization schema for the publisher (Mayutic / Ration). */
export function organizationSchema(opts?: {
	sameAs?: string[];
	founder?: AuthorInput;
}) {
	const schema: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: "Ration",
		legalName: "Mayutic",
		url: SITE_ORIGIN,
		logo: PUBLISHER_LOGO,
		description:
			"AI-native kitchen management for pantry inventory, meal planning, supply lists, and MCP agent control.",
	};
	if (opts?.sameAs && opts.sameAs.length > 0) {
		schema.sameAs = opts.sameAs;
	}
	if (opts?.founder) {
		schema.founder = personSchema(opts.founder, { embed: true });
	}
	return schema;
}

/** WebSite schema. Optionally exposes a SearchAction for site search. */
export function websiteSchema(opts?: { searchUrlTemplate?: string }) {
	const schema: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: "Ration",
		url: SITE_ORIGIN,
		description:
			"AI-native kitchen management: pantry inventory, meal planning, shopping lists, and MCP agent control.",
		publisher: { "@type": "Organization", name: "Ration" },
	};
	if (opts?.searchUrlTemplate) {
		schema.potentialAction = {
			"@type": "SearchAction",
			target: {
				"@type": "EntryPoint",
				urlTemplate: opts.searchUrlTemplate,
			},
			"query-input": "required name=search_term_string",
		};
	}
	return schema;
}

/** Person schema for an author/founder. */
export function personSchema(author: AuthorInput, opts?: { embed?: boolean }) {
	const schema: Record<string, unknown> = {
		"@type": "Person",
		name: author.name,
	};
	if (!opts?.embed) {
		schema["@context"] = "https://schema.org";
	}
	if (author.url) schema.url = author.url;
	if (author.jobTitle) schema.jobTitle = author.jobTitle;
	if (author.sameAs && author.sameAs.length > 0) schema.sameAs = author.sameAs;
	return schema;
}

/* -------------------------------------------------------------------------- */
/* Page-type schemas                                                          */
/* -------------------------------------------------------------------------- */

/**
 * SoftwareApplication schema for the main Ration product. Multiple offers
 * can be passed (free + paid tiers); they are emitted under a single
 * AggregateOffer when more than one is provided.
 */
export function softwareAppSchema(opts: {
	name?: string;
	description?: string;
	offers: SoftwareOffer[];
	applicationCategory?: string;
}) {
	const offers = opts.offers.map((o) => ({
		"@type": "Offer",
		name: o.name,
		price: o.price,
		priceCurrency: o.priceCurrency,
		...(o.description ? { description: o.description } : {}),
	}));

	const offersField =
		offers.length === 1
			? offers[0]
			: {
					"@type": "AggregateOffer",
					offerCount: offers.length,
					lowPrice: offers
						.map((o) => Number.parseFloat(o.price))
						.reduce((min, p) => (p < min ? p : min), Number.POSITIVE_INFINITY)
						.toString(),
					highPrice: offers
						.map((o) => Number.parseFloat(o.price))
						.reduce((max, p) => (p > max ? p : max), 0)
						.toString(),
					priceCurrency: offers[0]?.priceCurrency ?? "USD",
					offers,
				};

	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: opts.name ?? "Ration",
		applicationCategory: opts.applicationCategory ?? "LifestyleApplication",
		operatingSystem: "Web",
		url: SITE_ORIGIN,
		description:
			opts.description ??
			"AI-native kitchen management for pantry inventory, meal planning, supply lists, and MCP agent control.",
		offers: offersField,
		publisher: { "@type": "Organization", name: "Ration" },
	};
}

/**
 * Generic WebApplication schema for sub-tools (e.g. unit converter).
 */
export function webAppSchema(opts: {
	name: string;
	description: string;
	path: string;
	applicationCategory?: string;
	price?: string;
	priceCurrency?: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "WebApplication",
		name: opts.name,
		applicationCategory: opts.applicationCategory ?? "UtilitiesApplication",
		operatingSystem: "Web",
		url: absoluteSiteUrl(opts.path),
		description: opts.description,
		offers: {
			"@type": "Offer",
			price: opts.price ?? "0",
			priceCurrency: opts.priceCurrency ?? "USD",
		},
	};
}

/** BreadcrumbList — pass ordered crumbs from root to current page. */
export function breadcrumbSchema(crumbs: Crumb[]) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: crumbs.map((c, idx) => ({
			"@type": "ListItem",
			position: idx + 1,
			name: c.name,
			item: absoluteSiteUrl(c.path),
		})),
	};
}

/** FAQPage — useful for the homepage and pricing pages. */
export function faqSchema(entries: FaqEntry[]) {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: entries.map((e) => ({
			"@type": "Question",
			name: e.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: e.answer,
			},
		})),
	};
}

/** BlogPosting / Article schema. Replaces the inline schema in blog.$slug. */
export function articleSchema(post: ArticleInput) {
	const url = absoluteSiteUrl(`/blog/${post.slug}`);
	return {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		headline: post.title,
		description: post.description,
		datePublished: post.datePublished,
		dateModified: post.dateModified,
		url,
		mainEntityOfPage: url,
		image: [absoluteSiteUrl(post.image)],
		author: personSchema(post.author, { embed: true }),
		publisher: {
			"@type": "Organization",
			name: "Ration",
			logo: {
				"@type": "ImageObject",
				url: OG_IMAGE,
			},
		},
		keywords: post.tags,
	};
}

/** Blog (collection) schema for the /blog index page. */
export function blogCollectionSchema(opts: {
	posts: { slug: string; title: string; description: string; date: string }[];
}) {
	return {
		"@context": "https://schema.org",
		"@type": "Blog",
		name: "Ration Blog",
		url: absoluteSiteUrl("/blog"),
		description:
			"Tips for pantry organization, meal planning, reducing food waste, and using Ration with AI assistants.",
		blogPost: opts.posts.map((p) => ({
			"@type": "BlogPosting",
			headline: p.title,
			description: p.description,
			url: absoluteSiteUrl(`/blog/${p.slug}`),
			datePublished: p.date,
		})),
	};
}

/** WebPage schema for static informational pages (legal, about). */
export function webPageSchema(opts: {
	name: string;
	description: string;
	path: string;
	dateModified?: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: opts.name,
		description: opts.description,
		url: absoluteSiteUrl(opts.path),
		...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
		publisher: { "@type": "Organization", name: "Ration" },
	};
}
