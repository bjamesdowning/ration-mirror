import { defineConfig } from "vitest/config";

/**
 * MCP e2e suite: real JSON-RPC against the ration-mcp worker bundle in
 * Miniflare with local bindings. Not part of `test:unit`.
 * Run with `bun run test:mcp-e2e`. See docs/dev/mcp-e2e.md.
 */
export default defineConfig({
	test: {
		environment: "node",
		include: ["e2e/mcp/**/*.mcp-e2e.ts"],
		globalSetup: ["e2e/mcp/global-setup.ts"],
		// Cases share one seeded kitchen and run in order.
		fileParallelism: false,
		sequence: { concurrent: false },
		testTimeout: 30_000,
		hookTimeout: 60_000,
		reporters: process.env.CI
			? ["default", ["junit", { suiteName: "Ration MCP e2e" }]]
			: ["default"],
		outputFile: {
			junit: "./reports/mcp-e2e-junit.xml",
		},
	},
});
