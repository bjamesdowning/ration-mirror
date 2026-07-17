import { describe, expect, it } from "vitest";
import { resolveHelpHref } from "~/lib/help/resolve-help-href";
import { splitLegalSections } from "~/lib/legal/split-legal-sections";

describe("resolveHelpHref", () => {
	it("maps same-folder article links to /help/:slug", () => {
		expect(resolveHelpHref("./10-cargo-inventory.md")).toEqual({
			kind: "internal",
			to: "/help/10-cargo-inventory",
		});
		expect(resolveHelpHref("31-mcp-connection-setup.md")).toEqual({
			kind: "internal",
			to: "/help/31-mcp-connection-setup",
		});
	});

	it("keeps site and external URLs", () => {
		expect(resolveHelpHref("/docs/api")).toEqual({
			kind: "internal",
			to: "/docs/api",
		});
		expect(resolveHelpHref("https://example.com")).toEqual({
			kind: "external",
			href: "https://example.com",
		});
	});

	it("does not expose repo-relative paths as site routes", () => {
		expect(resolveHelpHref("../../plans/oauth-flow-contract.md")).toEqual({
			kind: "plain",
		});
		expect(resolveHelpHref("plans/oauth-flow-contract.md")).toEqual({
			kind: "plain",
		});
	});
});

describe("splitLegalSections", () => {
	it("wraps named sections for anchor IDs", () => {
		const chunks = splitLegalSections(`# Intro

<!-- section:trader-information -->
## Trader
Mayutic
<!-- /section -->

## Next
`);
		expect(chunks).toEqual([
			{ kind: "markdown", content: "# Intro\n\n" },
			{
				kind: "section",
				id: "trader-information",
				content: "## Trader\nMayutic",
			},
			{ kind: "markdown", content: "\n\n## Next\n" },
		]);
	});
});
