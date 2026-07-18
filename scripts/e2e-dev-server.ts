#!/usr/bin/env bun
/**
 * Start `dev:local` for Playwright after a warm optimize-deps pass.
 *
 * Fresh Vite + Cloudflare Miniflare often crashes on the first boot while
 * SSR optimize-deps chunk hashes change mid-load. A short first run populates
 * `node_modules/.vite`, then the long-lived second process serves E2E stably.
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const VITE_CACHE = join(ROOT, "node_modules/.vite");
const WARM_MS = Number(process.env.E2E_VITE_WARM_MS ?? "35000");

function runDev(logLabel: string): ReturnType<typeof spawn> {
	const child = spawn("bun", ["run", "dev:local"], {
		cwd: ROOT,
		env: { ...process.env, RATION_DEV_MODE: "local" },
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

async function main(): Promise<void> {
	if (!existsSync(join(VITE_CACHE, "deps_server", "_metadata.json"))) {
		console.warn(
			`[e2e-dev-server] Warming Vite optimize cache (${WARM_MS}ms)…`,
		);
		const warm = runDev("warm");
		await sleep(WARM_MS);
		warm.kill("SIGTERM");
		await sleep(1500);
		if (!warm.killed) warm.kill("SIGKILL");
		await sleep(500);
	} else {
		console.warn("[e2e-dev-server] Reusing existing Vite optimize cache");
	}

	const server = runDev("serve");
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

main().catch((err) => {
	console.error(err);
	// If warm left a half-written cache, clear so the next attempt can rebuild.
	try {
		rmSync(VITE_CACHE, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
	process.exit(1);
});
