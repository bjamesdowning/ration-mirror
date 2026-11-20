#!/usr/bin/env bun
/**
 * Start `dev:local` for Playwright.
 *
 * Fresh Vite + Cloudflare Miniflare often exits on the first boot while
 * SSR optimize-deps chunk hashes change mid-load. That pass can run for
 * over a minute. If the process dies during it, start again so the next
 * boot reuses the cache. Keep the cache: wiping it repeats the race.
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const VITE_CACHE = join(ROOT, "node_modules/.vite");
const STABLE_MS = 120_000;
const ATTEMPTS = 3;

/** Enable already-live AI kill switches for local E2E (registry defaults are off). */
const E2E_AI_FLAG_OVERRIDES = {
	"ai-scan-receipt": true,
	"ai-import-url": true,
	"ai-import-web": true,
	"ai-import-social": true,
	"ai-import-photo": true,
	"ai-dock-from-receipt": true,
	"ai-generate-meal": true,
	"ai-plan-week": true,
} as const;

function resolveFeatureFlagOverrides(): string {
	const raw = process.env.FEATURE_FLAG_OVERRIDES?.trim();
	if (!raw) return JSON.stringify(E2E_AI_FLAG_OVERRIDES);
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return JSON.stringify({ ...E2E_AI_FLAG_OVERRIDES, ...parsed });
		}
	} catch {
		/* keep E2E defaults */
	}
	return JSON.stringify(E2E_AI_FLAG_OVERRIDES);
}

function devLauncher(): { command: string; args: string[] } {
	// Miniflare's workerd dispatcher is a real DNS lookup under Bun
	// (dummy.invalid, and the Vite export-types localhost fetch).
	// The merge-request job puts a pinned Node on PATH and sets CI.
	if (process.env.CI === "true") {
		return { command: "node", args: ["--run", "dev:local"] };
	}
	return { command: "bun", args: ["run", "dev:local"] };
}

function runDev(logLabel: string): ReturnType<typeof spawn> {
	const launcher = devLauncher();
	const child = spawn(launcher.command, launcher.args, {
		cwd: ROOT,
		env: {
			...process.env,
			RATION_DEV_MODE: "local",
			FEATURE_FLAG_OVERRIDES: resolveFeatureFlagOverrides(),
		},
		stdio: ["ignore", "inherit", "inherit"],
	});
	child.on("exit", (code, signal) => {
		if (code !== 0 && code !== null) {
			console.error(`[e2e-dev-server] ${logLabel} exited code=${code}`);
		}
		if (signal) {
			console.error(`[e2e-dev-server] ${logLabel} signal=${signal}`);
		}
	});
	return child;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function waitUntilStable(
	child: ReturnType<typeof spawn>,
): Promise<number | null | "alive"> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve("alive"), STABLE_MS);
		child.once("exit", (code) => {
			clearTimeout(timer);
			resolve(code);
		});
	});
}

async function main(): Promise<void> {
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		const label = attempt === 1 ? "serve" : `serve-${attempt}`;
		const server = runDev(label);
		const early = await waitUntilStable(server);
		if (early === "alive") {
			const shutdown = () => {
				server.kill("SIGTERM");
			};
			process.on("SIGINT", shutdown);
			process.on("SIGTERM", shutdown);
			const code = await new Promise<number | null>((resolve) => {
				server.on("exit", (c) => resolve(c));
			});
			process.exit(code ?? 1);
		}
		console.warn(
			`[e2e-dev-server] ${label} exited early (${early ?? "null"}); trying again`,
		);
		await sleep(1500);
	}
	process.exit(1);
}

main().catch((err) => {
	console.error(err);
	try {
		rmSync(VITE_CACHE, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
	process.exit(1);
});
