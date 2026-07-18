import { describe, expect, it } from "vitest";
import {
	isAccessWallAiMessage,
	isBlockedPageContent,
	isSiteBlockHttpStatus,
	SITE_BLOCKED_CODE,
} from "~/lib/recipe-import-block.server";

const PEOPLE_INC_ACCESS_PAGE = `
<p>
  If you are a reader experiencing an access issue, please contact
  <a href="mailto:support@people.inc">support@people.inc</a>.
</p>
<p>
  If you would like to access our content for licensing, please contact
  <a href="mailto:contentlicensing@people.inc">contentlicensing@people.inc</a>.
</p>
`;

const RECIPE_HTML = `
<html><body>
<script type="application/ld+json">
{"@type":"Recipe","name":"Potato Salad","recipeIngredient":["potatoes","mayo"]}
</script>
<h1>Simple Potato Salad</h1>
<p>Boil the potatoes until tender. Mix with mayo and serve cold.</p>
</body></html>
`;

describe("isBlockedPageContent", () => {
	it("detects People Inc access-issue support pages", () => {
		expect(isBlockedPageContent(PEOPLE_INC_ACCESS_PAGE)).toBe(true);
	});

	it("detects Cloudflare-style challenge copy", () => {
		expect(
			isBlockedPageContent(
				"<html>Just a moment... Checking your browser before accessing</html>",
			),
		).toBe(true);
	});

	it("does not flag a normal recipe page", () => {
		expect(isBlockedPageContent(RECIPE_HTML)).toBe(false);
	});
});

describe("isSiteBlockHttpStatus", () => {
	it("treats 402, 403, and 429 as site blocks", () => {
		expect(isSiteBlockHttpStatus(402)).toBe(true);
		expect(isSiteBlockHttpStatus(403)).toBe(true);
		expect(isSiteBlockHttpStatus(429)).toBe(true);
		expect(isSiteBlockHttpStatus(404)).toBe(false);
		expect(isSiteBlockHttpStatus(200)).toBe(false);
	});
});

describe("isAccessWallAiMessage", () => {
	it("maps Gemini access-issue phrasing to site block", () => {
		expect(
			isAccessWallAiMessage(
				"The provided text is an access issue support page, not a recipe.",
			),
		).toBe(true);
	});

	it("does not map unrelated NOT_A_RECIPE messages", () => {
		expect(
			isAccessWallAiMessage("This page is a news homepage with no recipe."),
		).toBe(false);
		expect(isAccessWallAiMessage("The provided text is not a recipe.")).toBe(
			false,
		);
	});
});

describe("SITE_BLOCKED_CODE", () => {
	it("is stable for clients", () => {
		expect(SITE_BLOCKED_CODE).toBe("SITE_BLOCKED");
	});
});
