import { describe, expect, it } from "vitest";
import { AGENT_SETUP_PROMPT, buildSetupMarkdown } from "../agent-setup";

describe("agent setup prompt", () => {
	it("copies only the setup.md sentence", () => {
		expect(AGENT_SETUP_PROMPT).toBe(
			"Fetch and execute the appropriate instructions to set me up for Ration from https://ration.mayutic.com/setup.md",
		);
		expect(AGENT_SETUP_PROMPT).not.toContain("/auth.md");
		expect(AGENT_SETUP_PROMPT).not.toContain("/mcp.md");
	});

	it("publishes a short imperative setup page", () => {
		const md = buildSetupMarkdown(
			new Request("https://ration.mayutic.com/setup.md"),
		);

		expect(md.startsWith("# Ration setup\n")).toBe(true);
		expect(md).toContain(
			"This file is published at https://ration.mayutic.com/setup.md.",
		);
		expect(md).toContain("https://mcp.ration.mayutic.com/mcp");
		expect(md).toContain("https://ration.mayutic.com/auth.md");
		expect(md).toContain("https://ration.mayutic.com/connect");
		expect(md).toContain('{ "type": "anonymous", "client_hint": "<client>" }');
		expect(md).toContain("Do not print the key");
		expect(md).toContain("`get_context`");
		expect(md).toContain(".cursor/mcp.json");
		expect(md).not.toContain("/mcp.md");
		expect(md).not.toContain("archive_supply_list");
	});
});
