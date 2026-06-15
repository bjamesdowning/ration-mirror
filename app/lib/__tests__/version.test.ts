import { describe, expect, it } from "vitest";
import { APP_VERSION, MCP_SERVER_VERSION } from "../version";

describe("version", () => {
	it("keeps MCP server version aligned with app version", () => {
		expect(MCP_SERVER_VERSION).toBe(APP_VERSION);
	});

	it("uses semver patch format", () => {
		expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
