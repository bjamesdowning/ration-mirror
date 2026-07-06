import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	isRegisteredWellKnownPath,
	WELL_KNOWN_AGENT_SKILLS_PREFIX,
	WELL_KNOWN_ALLOW_EXACT,
} from "../well-known-routes";

/** Extracts static `.well-known/*` route paths from `app/routes.ts`. */
function parseWellKnownRoutesFromRoutesFile(): string[] {
	const routesPath = join(process.cwd(), "app/routes.ts");
	const source = readFileSync(routesPath, "utf8");
	const paths = new Set<string>();
	const routePattern = /route\s*\(\s*["'](\.well-known\/[^"']+)["']/g;
	for (const match of source.matchAll(routePattern)) {
		const segment = match[1];
		if (segment.includes(":")) continue;
		paths.add(`/${segment}`);
	}
	return [...paths].sort();
}

describe("well-known routes sync", () => {
	it("includes AASA in the Worker allow list (CR-2 regression guard)", () => {
		expect(WELL_KNOWN_ALLOW_EXACT).toContain(
			"/.well-known/apple-app-site-association",
		);
	});

	it("covers every static .well-known route in app/routes.ts", () => {
		const registered = parseWellKnownRoutesFromRoutesFile();
		expect(registered.length).toBeGreaterThan(0);
		for (const pathname of registered) {
			expect(
				isRegisteredWellKnownPath(pathname),
				`${pathname} is registered in routes.ts but missing from well-known-routes.ts`,
			).toBe(true);
		}
	});

	it("does not allow stale entries missing from app/routes.ts", () => {
		const registered = new Set(parseWellKnownRoutesFromRoutesFile());
		for (const pathname of WELL_KNOWN_ALLOW_EXACT) {
			expect(
				registered.has(pathname),
				`${pathname} is in well-known-routes.ts but not registered in routes.ts`,
			).toBe(true);
		}
	});

	it("allows parameterized agent-skills paths via prefix rule", () => {
		expect(
			isRegisteredWellKnownPath(
				`${WELL_KNOWN_AGENT_SKILLS_PREFIX}connect-ration-mcp/SKILL.md`,
			),
		).toBe(true);
	});

	it("does not allow unknown well-known paths", () => {
		expect(isRegisteredWellKnownPath("/.well-known/unknown-probe")).toBe(false);
	});
});
