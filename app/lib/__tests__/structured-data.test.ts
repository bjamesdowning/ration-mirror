import { describe, expect, it } from "vitest";
import {
	articleSchema,
	blogCollectionSchema,
	breadcrumbSchema,
	faqSchema,
	organizationSchema,
	personSchema,
	softwareAppSchema,
	webAppSchema,
	webPageSchema,
	websiteSchema,
} from "~/lib/structured-data";

const SITE = "https://ration.mayutic.com";

describe("organizationSchema", () => {
	it("emits the required @context, @type, name, url, and logo", () => {
		const schema = organizationSchema() as Record<string, unknown>;
		expect(schema["@context"]).toBe("https://schema.org");
		expect(schema["@type"]).toBe("Organization");
		expect(schema.name).toBe("Ration");
		expect(schema.url).toBe(SITE);
		expect(schema.logo).toContain("/static/ration-logo.svg");
	});

	it("includes sameAs and founder when provided", () => {
		const schema = organizationSchema({
			sameAs: ["https://github.com/test"],
			founder: { name: "Jane Doe", jobTitle: "Founder" },
		}) as Record<string, unknown>;
		expect(schema.sameAs).toEqual(["https://github.com/test"]);
		expect((schema.founder as Record<string, unknown>)["@type"]).toBe("Person");
		expect((schema.founder as Record<string, unknown>).name).toBe("Jane Doe");
	});

	it("omits sameAs and founder when not provided", () => {
		const schema = organizationSchema() as Record<string, unknown>;
		expect("sameAs" in schema).toBe(false);
		expect("founder" in schema).toBe(false);
	});
});

describe("websiteSchema", () => {
	it("emits a SearchAction when a search template is provided", () => {
		const schema = websiteSchema({
			searchUrlTemplate: `${SITE}/search?q={search_term_string}`,
		}) as Record<string, unknown>;
		const action = schema.potentialAction as Record<string, unknown>;
		expect(action["@type"]).toBe("SearchAction");
		expect(action["query-input"]).toBe("required name=search_term_string");
	});

	it("omits potentialAction when no search template is provided", () => {
		const schema = websiteSchema() as Record<string, unknown>;
		expect("potentialAction" in schema).toBe(false);
	});
});

describe("personSchema", () => {
	it("includes @context when not embedded", () => {
		const schema = personSchema({ name: "Test" }) as Record<string, unknown>;
		expect(schema["@context"]).toBe("https://schema.org");
		expect(schema["@type"]).toBe("Person");
	});

	it("omits @context when embed=true (used inside another schema)", () => {
		const schema = personSchema({ name: "Test" }, { embed: true }) as Record<
			string,
			unknown
		>;
		expect("@context" in schema).toBe(false);
		expect(schema["@type"]).toBe("Person");
	});

	it("includes optional fields only when provided", () => {
		const minimal = personSchema({ name: "Test" }) as Record<string, unknown>;
		expect("url" in minimal).toBe(false);
		expect("jobTitle" in minimal).toBe(false);
		expect("sameAs" in minimal).toBe(false);

		const full = personSchema({
			name: "Test",
			url: "https://example.com",
			jobTitle: "CEO",
			sameAs: ["https://github.com/test"],
		}) as Record<string, unknown>;
		expect(full.url).toBe("https://example.com");
		expect(full.jobTitle).toBe("CEO");
		expect(full.sameAs).toEqual(["https://github.com/test"]);
	});
});

describe("softwareAppSchema", () => {
	it("emits a single Offer when only one offer is provided", () => {
		const schema = softwareAppSchema({
			offers: [{ name: "Free", price: "0", priceCurrency: "USD" }],
		}) as Record<string, unknown>;
		expect(schema["@type"]).toBe("SoftwareApplication");
		expect(schema.applicationCategory).toBe("LifestyleApplication");
		const offers = schema.offers as Record<string, unknown>;
		expect(offers["@type"]).toBe("Offer");
		expect(offers.price).toBe("0");
	});

	it("emits an AggregateOffer when multiple offers are provided", () => {
		const schema = softwareAppSchema({
			offers: [
				{ name: "Free", price: "0", priceCurrency: "USD" },
				{ name: "Pro", price: "5", priceCurrency: "USD" },
				{ name: "Team", price: "20", priceCurrency: "USD" },
			],
		}) as Record<string, unknown>;
		const offers = schema.offers as Record<string, unknown>;
		expect(offers["@type"]).toBe("AggregateOffer");
		expect(offers.offerCount).toBe(3);
		expect(offers.lowPrice).toBe("0");
		expect(offers.highPrice).toBe("20");
	});

	it("uses provided name and applicationCategory overrides", () => {
		const schema = softwareAppSchema({
			name: "Custom",
			applicationCategory: "BusinessApplication",
			offers: [{ name: "Free", price: "0", priceCurrency: "USD" }],
		}) as Record<string, unknown>;
		expect(schema.name).toBe("Custom");
		expect(schema.applicationCategory).toBe("BusinessApplication");
	});
});

describe("webAppSchema", () => {
	it("uses absolute URLs for the path", () => {
		const schema = webAppSchema({
			name: "Unit Converter",
			description: "Convert units",
			path: "/tools/unit-converter",
		}) as Record<string, unknown>;
		expect(schema.url).toBe(`${SITE}/tools/unit-converter`);
		expect(schema["@type"]).toBe("WebApplication");
	});

	it("defaults price to 0 USD", () => {
		const schema = webAppSchema({
			name: "X",
			description: "Y",
			path: "/x",
		}) as Record<string, unknown>;
		const offer = schema.offers as Record<string, unknown>;
		expect(offer.price).toBe("0");
		expect(offer.priceCurrency).toBe("USD");
	});
});

describe("breadcrumbSchema", () => {
	it("numbers crumbs starting at 1 and converts paths to absolute URLs", () => {
		const schema = breadcrumbSchema([
			{ name: "Home", path: "/" },
			{ name: "Blog", path: "/blog" },
			{ name: "Post", path: "/blog/post" },
		]) as Record<string, unknown>;
		const list = schema.itemListElement as Array<Record<string, unknown>>;
		expect(list).toHaveLength(3);
		expect(list[0]).toEqual({
			"@type": "ListItem",
			position: 1,
			name: "Home",
			item: `${SITE}/`,
		});
		expect(list[2].position).toBe(3);
		expect(list[2].item).toBe(`${SITE}/blog/post`);
	});

	it("handles empty crumb arrays without crashing", () => {
		const schema = breadcrumbSchema([]) as Record<string, unknown>;
		expect(schema.itemListElement).toEqual([]);
	});
});

describe("faqSchema", () => {
	it("wraps each question/answer pair in Question + Answer types", () => {
		const schema = faqSchema([
			{ question: "Q1?", answer: "A1." },
			{ question: "Q2?", answer: "A2." },
		]) as Record<string, unknown>;
		expect(schema["@type"]).toBe("FAQPage");
		const entities = schema.mainEntity as Array<Record<string, unknown>>;
		expect(entities).toHaveLength(2);
		expect(entities[0]["@type"]).toBe("Question");
		expect(entities[0].name).toBe("Q1?");
		expect(
			(entities[0].acceptedAnswer as Record<string, unknown>)["@type"],
		).toBe("Answer");
		expect((entities[0].acceptedAnswer as Record<string, unknown>).text).toBe(
			"A1.",
		);
	});
});

describe("articleSchema", () => {
	it("produces a complete BlogPosting with absolute image URL", () => {
		const schema = articleSchema({
			slug: "test-slug",
			title: "Test Title",
			description: "Test description",
			datePublished: "2026-03-10",
			dateModified: "2026-03-11",
			image: "/static/og/test.png",
			tags: ["mcp", "ai"],
			author: { name: "Jane Doe" },
		}) as Record<string, unknown>;
		expect(schema["@type"]).toBe("BlogPosting");
		expect(schema.headline).toBe("Test Title");
		expect(schema.url).toBe(`${SITE}/blog/test-slug`);
		expect(schema.mainEntityOfPage).toBe(`${SITE}/blog/test-slug`);
		expect(schema.image).toEqual([`${SITE}/static/og/test.png`]);
		expect(schema.keywords).toEqual(["mcp", "ai"]);
		expect((schema.author as Record<string, unknown>)["@type"]).toBe("Person");
		expect((schema.author as Record<string, unknown>).name).toBe("Jane Doe");
	});
});

describe("blogCollectionSchema", () => {
	it("emits a Blog with one BlogPosting per item", () => {
		const schema = blogCollectionSchema({
			posts: [
				{
					slug: "a",
					title: "A",
					description: "First",
					date: "2026-03-10",
				},
				{
					slug: "b",
					title: "B",
					description: "Second",
					date: "2026-03-11",
				},
			],
		}) as Record<string, unknown>;
		expect(schema["@type"]).toBe("Blog");
		const list = schema.blogPost as Array<Record<string, unknown>>;
		expect(list).toHaveLength(2);
		expect(list[0]["@type"]).toBe("BlogPosting");
		expect(list[0].url).toBe(`${SITE}/blog/a`);
	});
});

describe("webPageSchema", () => {
	it("includes dateModified only when provided", () => {
		const without = webPageSchema({
			name: "X",
			description: "Y",
			path: "/x",
		}) as Record<string, unknown>;
		expect("dateModified" in without).toBe(false);

		const withDate = webPageSchema({
			name: "X",
			description: "Y",
			path: "/x",
			dateModified: "2026-03-11",
		}) as Record<string, unknown>;
		expect(withDate.dateModified).toBe("2026-03-11");
	});
});
