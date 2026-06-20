import { describe, expect, it } from "vitest";
import { escapeXml } from "~/routes/blog.rss.xml";

describe("escapeXml", () => {
	it("escapes XML special characters", () => {
		expect(escapeXml(`Tom & Jerry's "pantry"`)).toBe(
			`Tom &amp; Jerry&apos;s &quot;pantry&quot;`,
		);
	});
});

describe("blog RSS loader", () => {
	it("includes content:encoded with full markdown bodies", async () => {
		const { loader } = await import("~/routes/blog.rss.xml");
		const response = await loader({
			request: new Request("https://ration.mayutic.com/blog/rss.xml"),
		} as never);
		const xml = await response.text();

		expect(xml).toContain(
			'xmlns:content="http://purl.org/rss/1.0/modules/content/"',
		);
		expect(xml).toContain("<content:encoded><![CDATA[");
		expect(xml).toContain("# ");
	});
});
