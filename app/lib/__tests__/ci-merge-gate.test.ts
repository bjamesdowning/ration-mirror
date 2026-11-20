import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("merge-request typecheck", () => {
	const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
		scripts: Record<string, string>;
	};
	const ci = readFileSync(".gitlab-ci.yml", "utf8");

	it("keeps the Bun install offline and typechecks on Node", () => {
		expect(pkg.scripts["cf-typegen"]).toBe(
			"wrangler types --include-runtime=false",
		);
		expect(pkg.scripts.typecheck).toBe(
			"bun run cf-typegen && react-router typegen && tsc -b",
		);
		expect(ci).toContain("    - wrangler types\n");
		expect(ci).toContain("    - react-router typegen\n");
		expect(ci).toContain("    - tsc -b\n");
		expect(ci).toContain("node --run test:unit");
		expect(ci).toContain("bun scripts/ci-install-node.ts");
		expect(ci).toContain("v22.23.5");
		expect(ci).toContain(
			"c54118104acc524633b5abe106bbf44a53126ec8b4e5fa105cb92b5d7de8a1a1",
		);
		expect(ci).toContain("bunx biome check --write .");
		expect(ci).toContain("bun run lint");
	});

	it("limits the GitLab workflow to merge requests", () => {
		expect(ci).toContain(
			"image: oven/bun@sha256:c017a211c49a21adc0e49dda7b60ac8112887c3d9465e01427f434ed107c830e",
		);
		expect(ci).toContain('if: $CI_PIPELINE_SOURCE == "merge_request_event"');
		expect(ci).not.toContain("CI_DEFAULT_BRANCH");
		expect(ci).not.toContain("CI_COMMIT_BRANCH");
		expect(ci).not.toContain("oven/bun:1");
		expect(ci).not.toContain("oven/bun:latest");
		expect(ci).toContain("bun install --frozen-lockfile --ignore-scripts");
		for (const name of [
			"\nlint:\n",
			"\ntypecheck:\n",
			"\nunit:\n",
			"\nflag-check:\n",
			"\ne2e:\n",
		]) {
			expect(ci).toContain(name);
		}
	});

	it("starts the dev server with Node in CI", () => {
		const server = readFileSync("scripts/e2e-dev-server.ts", "utf8");
		expect(server).toContain('process.env.CI === "true"');
		expect(server).toContain('command: "node"');
		expect(server).toContain('"--run", "dev:local"');
	});
});
