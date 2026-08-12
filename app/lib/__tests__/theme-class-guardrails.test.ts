import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for dark-mode token misuse.
 * `carbon` remaps to light text in `.dark` — never use it as a fill/scrim.
 * See docs/dev/appearance-audit.md and README Appearance & theming.
 */
const FORBIDDEN = [
	{
		pattern: /dark:bg-carbon\b/,
		label: "dark:bg-carbon (use modal-surface / platinum)",
	},
	{
		pattern: /backdrop:bg-carbon\b/,
		label: "backdrop:bg-carbon (use backdrop:bg-black/*)",
	},
	{
		pattern: /hover:bg-gray-50\b/,
		label: "hover:bg-gray-50 (use btn-secondary / theme hover)",
	},
] as const;

const ROOT = join(process.cwd(), "app");
const EXTENSIONS = new Set([".tsx", ".ts", ".css"]);

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name === "__tests__") continue;
		const path = join(dir, name);
		const st = statSync(path);
		if (st.isDirectory()) {
			walk(path, out);
			continue;
		}
		const ext = name.slice(name.lastIndexOf("."));
		if (EXTENSIONS.has(ext)) out.push(path);
	}
	return out;
}

describe("theme class guardrails", () => {
	it("forbids inverted carbon fills and light-only gray hovers in app UI sources", () => {
		const files = walk(ROOT);
		const violations: string[] = [];

		for (const file of files) {
			const text = readFileSync(file, "utf8");
			const rel = relative(process.cwd(), file);
			for (const { pattern, label } of FORBIDDEN) {
				if (pattern.test(text)) {
					violations.push(`${rel}: ${label}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});
});
