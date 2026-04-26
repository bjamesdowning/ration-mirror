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

	it("accepts legacy mcp scope for backward compatibility", () => {
		const parsed = CreateApiKeySchema.parse({
			name: "Legacy MCP",
			scopes: ["mcp"],
		});

		expect(parsed.scopes).toEqual(["mcp"]);
	});

	it("rejects unknown MCP scope names", () => {
		const result = CreateApiKeySchema.safeParse({
			name: "Invalid",
			scopes: ["mcp:plan:write"],
		});

		expect(result.success).toBe(false);
	});
});
