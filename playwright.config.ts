import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against local dev server on port 5173.
 * - Default: Playwright starts `bun run dev:local` (local D1/KV/R2, fast startup).
 * - With existing server: `bun run dev` in one terminal, then `bun run test:e2e` — Playwright reuses it.
 * - With custom URL: `PLAYWRIGHT_BASE_URL=http://localhost:5173 bun run test:e2e` — Playwright reuses it.
 * - With deployed URL: `PLAYWRIGHT_BASE_URL=https://... bun run test:e2e` — set webServer to undefined.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const useExternalServer = !!process.env.PLAYWRIGHT_BASE_URL;
const requestedWorkers = Number(process.env.PLAYWRIGHT_WORKERS ?? "2");
const localWorkers =
	Number.isFinite(requestedWorkers) && requestedWorkers > 0
		? requestedWorkers
		: 2;

const authFile = "e2e/.auth/user.json";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 1,
	workers: process.env.CI ? 2 : localWorkers,
	timeout: 30000,
	reporter: process.env.CI ? "github" : "html",
	use: {
		baseURL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{ name: "setup", testMatch: /auth\.setup\.ts/ },
		{
			name: "chromium-public",
			use: { ...devices["Desktop Chrome"] },
			testMatch: ["e2e/smoke/**/*.spec.ts", "e2e/journeys/shared.spec.ts"],
			testIgnore: "e2e/smoke/navigation.spec.ts",
		},
		{
			name: "chromium-auth",
			use: {
				...devices["Desktop Chrome"],
				storageState: authFile,
			},
			testMatch: ["e2e/journeys/**/*.spec.ts", "e2e/smoke/navigation.spec.ts"],
			testIgnore: ["e2e/journeys/auth.spec.ts", "e2e/journeys/shared.spec.ts"],
			dependencies: ["setup"],
		},
		{
			name: "auth",
			use: { ...devices["Desktop Chrome"] },
			testMatch: "e2e/journeys/auth.spec.ts",
		},
	],
	webServer: useExternalServer
		? undefined
		: {
				command: "bun run dev:local",
				url: baseURL,
				reuseExistingServer: process.env.CI !== "true",
				timeout: 120000,
			},
});
