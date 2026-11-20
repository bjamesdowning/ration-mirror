#!/usr/bin/env bun
/**
 * Start `dev:local` for Playwright after a warm optimize-deps pass.
 *
 * Fresh Vite + Cloudflare Miniflare often crashes on the first boot while
 * SSR optimize-deps chunk hashes change mid-load. A short first run populates
 * `node_modules/.vite`, then the long-lived second process serves E2E stably.
 *
 * The warm process binds 5174. Playwright waits on 5173, so it must not see
 * the warm server. `node --run` does not kill its Vite child on SIGTERM, so
 * the warm process is started detached and stopped as a process group.
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const VITE_CACHE = join(ROOT, "node_modules/.vite");
const WARM_MS = Number(process.env.E2E_VITE_WARM_MS ?? "35000");
const SERVE_PORT = 5173;
const WARM_PORT = 5174;

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

function devLauncher(port: number): { command: string; args: string[] } {
	// Miniflare's workerd dispatcher is a real DNS lookup under Bun
	// (dummy.invalid, and the Vite export-types localhost fetch).
	// The merge-request job puts a pinned Node on PATH and sets CI.
	const portArgs = ["--port", String(port)];
	if (process.env.CI === "true") {
		return { command: "node", args: ["--run", "dev:local", "--", ...portArgs] };
	}
	return { command: "bun", args: ["run", "dev:local", "--", ...portArgs] };
}

function runDev(logLabel: string, port: number): ReturnType<typeof spawn> {
	const launcher = devLauncher(port);
	const child = spawn(launcher.command, launcher.args, {
		cwd: ROOT,
		env: {
			...process.env,
			PORT: String(port),
			RATION_DEV_MODE: "local",
			FEATURE_FLAG_OVERRIDES: resolveFeatureFlagOverrides(),
		},
		stdio: ["ignore", "inherit", "inherit"],
		detached: true,
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

function killDev(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
	if (child.pid === undefined) return;
	try {
		process.kill(-child.pid, signal);
	} catch {
		try {
			child.kill(signal);
		} catch {
			/* already exited */
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function isPortClosed(err: unknown): boolean {
	let current: unknown = err;
	for (let i = 0; i < 4 && current && typeof current === "object"; i += 1) {
		const code = (current as { code?: unknown }).code;
		if (code === "ECONNREFUSED") return true;
		current = (current as { cause?: unknown }).cause;
	}
	const message = err instanceof Error ? err.message : String(err);
	return message.includes("ECONNREFUSED");
}

async function waitUntilFree(port: number): Promise<void> {
	for (let i = 0; i < 40; i += 1) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/`, {
				signal: AbortSignal.timeout(500),
			});
			await res.arrayBuffer();
		} catch (err) {
			if (isPortClosed(err)) return;
		}
		await sleep(250);
	}
	throw new Error(`[e2e-dev-server] port ${port} stayed busy`);
}

async function waitForHttp(port: number, budgetMs: number): Promise<boolean> {
	const deadline = Date.now() + budgetMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/`, {
				signal: AbortSignal.timeout(2000),
			});
			await res.arrayBuffer();
			return true;
		} catch {
			await sleep(1000);
		}
	}
	return false;
}

async function warmRoutes(port: number): Promise<void> {
	const up = await waitForHttp(port, WARM_MS);
	if (!up) {
		console.warn("[e2e-dev-server] warm server did not answer; continuing");
		return;
	}
	for (const path of [
		"/",
		"/blog",
		"/blog/agentic-app-control-copilot",
		"/pricing",
	]) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}${path}`, {
				signal: AbortSignal.timeout(20000),
			});
			await res.arrayBuffer();
		} catch {
			console.warn(`[e2e-dev-server] warm fetch failed ${path}`);
		}
	}
	await sleep(4000);
}

async function main(): Promise<void> {
	if (!existsSync(join(VITE_CACHE, "deps_server", "_metadata.json"))) {
		console.warn(
			`[e2e-dev-server] Warming Vite optimize cache on ${WARM_PORT}…`,
		);
		const warm = runDev("warm", WARM_PORT);
		await warmRoutes(WARM_PORT);
		killDev(warm, "SIGTERM");
		await sleep(1500);
		killDev(warm, "SIGKILL");
		await waitUntilFree(WARM_PORT);
	} else {
		console.warn("[e2e-dev-server] Reusing existing Vite optimize cache");
	}

	await waitUntilFree(SERVE_PORT);
	const server = runDev("serve", SERVE_PORT);
	const shutdown = () => {
		killDev(server, "SIGTERM");
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
