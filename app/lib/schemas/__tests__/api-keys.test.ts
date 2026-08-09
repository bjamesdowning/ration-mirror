import { describe, expect, it } from "vitest";
import { CreateApiKeySchema } from "../api-keys";

describe("CreateApiKeySchema", () => {
	it("accepts granular MCP scopes", () => {
		const parsed = CreateApiKeySchema.parse({
			name: "Cursor MCP",
			scopes: ["mcp:read", "mcp:inventory:write"],
		});

		expect(parsed.scopes).toEqual(["mcp:read", "mcp:inventory:write"]);
	});

	it("rejects new keys with legacy blanket mcp scope", () => {
		const result = CreateApiKeySchema.safeParse({
			name: "Legacy MCP",
			scopes: ["mcp"],
		});

		expect(result.success).toBe(false);
	});

	it("rejects unknown MCP scope names", () => {
		const result = CreateApiKeySchema.safeParse({
			name: "Invalid",
			scopes: ["mcp:plan:write"],
		});

		expect(result.success).toBe(false);
	});
});
