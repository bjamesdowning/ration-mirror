/**
 * Vitest global setup for the MCP e2e suite.
 *
 * 1. Bundle the real ration-mcp worker with `wrangler deploy --dry-run`
 *    (the same bundle Workers Builds ships; nothing is uploaded).
 * 2. Load that bundle in Miniflare with in-memory local bindings only:
 *    D1 (DB, NUTRITION_DB), KV, and R2. No AI, Vectorize, Flagship,
 *    analytics, or any remote binding. No secrets.
 * 3. Apply drizzle/*.sql to the local D1, seed one test kitchen, and mint a
 *    test API key.
 * 4. Serve the worker on 127.0.0.1 and hand the URL and key to the tests.
 */

import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { Miniflare } from "miniflare";
import type { TestProject } from "vitest/node";
import {
	compareMigrationNames,
	splitDrizzleStatements,
} from "../../app/lib/drizzle-sql";
import { type SeedDatabase, type SeedResult, seedMcpKitchen } from "./seed";

declare module "vitest" {
	export interface ProvidedContext {
		mcpUrl: string;
		mcpApiKey: string;
		mcpSeed: Omit<SeedResult, "apiKey">;
	}
}

const ROOT = resolve(import.meta.dirname, "../..");
const WORKER_CONFIG = join(ROOT, "wrangler.mcp.jsonc");
const WORKER_NAME = "ration-mcp-e2e";

/**
 * Flags the suite needs on. Everything else keeps its registry default (off).
 * `FEATURE_FLAG_OVERRIDES` wins over Flagship, and there is no FLAGS binding.
 */
export const E2E_FLAG_OVERRIDES = {
	"nutrition-manifest": true,
	"nutrition-goals": true,
	"nutrition-cook-log-split": true,
};

function stripJsonc(text: string): string {
	let out = "";
	let inString = false;
	for (let index = 0; index < text.length; index++) {
		const char = text[index];
		const next = text[index + 1];
		if (inString) {
			out += char;
			if (char === "\\") {
				out += next ?? "";
				index++;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
			out += char;
		} else if (char === "/" && next === "/") {
			while (index < text.length && text[index] !== "\n") index++;
			out += "\n";
		} else if (char === "/" && next === "*") {
			index += 2;
			while (
				index < text.length &&
				!(text[index] === "*" && text[index + 1] === "/")
			) {
				index++;
			}
			index++;
		} else {
			out += char;
		}
	}
	return out.replace(/,\s*([}\]])/g, "$1");
}

function readWorkerConfig(): {
	compatibilityDate: string;
	compatibilityFlags: string[];
} {
	const config = JSON.parse(
		stripJsonc(readFileSync(WORKER_CONFIG, "utf8")),
	) as { compatibility_date?: unknown; compatibility_flags?: unknown };
	if (typeof config.compatibility_date !== "string") {
		throw new Error("wrangler.mcp.jsonc has no compatibility_date");
	}
	const flags = Array.isArray(config.compatibility_flags)
		? config.compatibility_flags.filter(
				(flag): flag is string => typeof flag === "string",
			)
		: [];
	return {
		compatibilityDate: config.compatibility_date,
		compatibilityFlags: flags,
	};
}

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

function bundleWorker(outdir: string): {
	mainModule: string;
	modules: Record<string, { type: "esm"; contents: string }>;
} {
	const wrangler = join(ROOT, "node_modules", ".bin", "wrangler");
	const result = spawnSync(
		wrangler,
		[
			"deploy",
			"--config",
			WORKER_CONFIG,
			"--env=",
			"--dry-run",
			"--outdir",
			outdir,
		],
		{
			cwd: ROOT,
			stdio: "inherit",
			env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
		},
	);
	if (result.status !== 0) {
		throw new Error(
			`wrangler deploy --dry-run failed (exit ${result.status ?? result.signal})`,
		);
	}
	const files = walk(outdir).filter(
		(file) => file.endsWith(".js") || file.endsWith(".mjs"),
	);
	if (files.length === 0) throw new Error(`no bundle in ${outdir}`);
	const main =
		files.find((file) => /(^|[\\/])(mcp|index)\.m?js$/.test(file)) ??
		files.slice().sort((a, b) => statSync(b).size - statSync(a).size)[0];
	const toModuleName = (file: string) =>
		relative(outdir, file).split(sep).join("/");
	const modules: Record<string, { type: "esm"; contents: string }> = {};
	for (const file of files) {
		modules[toModuleName(file)] = {
			type: "esm",
			contents: readFileSync(file, "utf8"),
		};
	}
	return { mainModule: toModuleName(main), modules };
}

async function migrate(db: SeedDatabase): Promise<number> {
	const dir = join(ROOT, "drizzle");
	const files = readdirSync(dir)
		.filter((name) => name.endsWith(".sql"))
		.sort(compareMigrationNames);
	for (const file of files) {
		const statements = splitDrizzleStatements(
			readFileSync(join(dir, file), "utf8"),
		).map((statement) => db.prepare(statement));
		if (statements.length > 0) await db.batch(statements);
	}
	return files.length;
}

export default async function setup(project: TestProject) {
	const workdir = mkdtempSync(join(tmpdir(), "ration-mcp-e2e-"));
	const { compatibilityDate, compatibilityFlags } = readWorkerConfig();
	const bundle = bundleWorker(join(workdir, "bundle"));

	const mf = new Miniflare({
		host: "127.0.0.1",
		port: 0,
		cf: false,
		workers: [
			{
				config: {
					name: WORKER_NAME,
					compatibilityDate,
					compatibilityFlags,
					env: {
						BETTER_AUTH_URL: { type: "text", value: "http://127.0.0.1" },
						// Local stand-in so auth helpers can construct. Not a secret.
						BETTER_AUTH_SECRET: {
							type: "text",
							value: "mcp-e2e-local-only-0123456789abcdef",
						},
						MCP_OAUTH_ENABLED: { type: "text", value: "false" },
						RATION_ENV: { type: "text", value: "development" },
						FEATURE_FLAG_OVERRIDES: {
							type: "text",
							value: JSON.stringify(E2E_FLAG_OVERRIDES),
						},
						DB: { type: "d1", id: "mcp-e2e-db" },
						NUTRITION_DB: { type: "d1", id: "mcp-e2e-nutrition" },
						RATION_KV: { type: "kv", id: "mcp-e2e-kv" },
						STORAGE: { type: "r2", name: "mcp-e2e-storage" },
					},
					manifest: bundle,
				},
			},
		],
	} as ConstructorParameters<typeof Miniflare>[0]);

	try {
		const url = await mf.ready;
		const db = (await mf.getD1Database(
			"DB",
			WORKER_NAME,
		)) as unknown as SeedDatabase;
		const applied = await migrate(db);
		const seed = await seedMcpKitchen(db);
		console.log(
			`[mcp-e2e] worker at ${url.origin}; ${applied} migrations; kitchen seeded for ${seed.today}`,
		);
		project.provide("mcpUrl", new URL("/mcp", url).href);
		project.provide("mcpApiKey", seed.apiKey);
		project.provide("mcpSeed", { today: seed.today, ids: seed.ids });
	} catch (error) {
		await mf.dispose();
		rmSync(workdir, { recursive: true, force: true });
		throw error;
	}

	return async () => {
		await mf.dispose();
		rmSync(workdir, { recursive: true, force: true });
	};
}
