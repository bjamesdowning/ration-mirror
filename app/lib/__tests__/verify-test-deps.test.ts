import { describe, expect, it } from "vitest";
import {
	findMissingCfTypegenDeps,
	findMissingTestDeps,
	formatPostinstallRecoveryMessage,
	formatTestDepsRecoveryMessage,
} from "../verify-test-deps";

describe("findMissingTestDeps", () => {
	it("returns empty when all critical paths exist", () => {
		expect(findMissingTestDeps(() => true)).toEqual([]);
	});

	it("lists missing paths", () => {
		expect(
			findMissingTestDeps((path) => path !== "node_modules/obug/dist/node.js"),
		).toEqual(["node_modules/obug/dist/node.js"]);
	});
});

describe("formatTestDepsRecoveryMessage", () => {
	it("includes missing paths and recovery commands", () => {
		const message = formatTestDepsRecoveryMessage([
			"node_modules/esbuild/lib/main.js",
		]);
		expect(message).toContain("node_modules/esbuild/lib/main.js");
		expect(message).toContain("bun install --ignore-scripts");
		expect(message).toContain("bun run cf-typegen");
	});
});

describe("findMissingCfTypegenDeps", () => {
	it("lists missing wrangler/undici paths", () => {
		expect(
			findMissingCfTypegenDeps(
				(p) => p !== "node_modules/undici/lib/dispatcher/client.js",
			),
		).toEqual(["node_modules/undici/lib/dispatcher/client.js"]);
	});
});

describe("formatPostinstallRecoveryMessage", () => {
	it("labels postinstall and includes cf-typegen recovery", () => {
		const message = formatPostinstallRecoveryMessage([
			"node_modules/undici/lib/dispatcher/client.js",
		]);
		expect(message).toContain("[postinstall]");
		expect(message).toContain("undici");
	});
});
