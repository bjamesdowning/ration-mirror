import { defineConfig, devices } from "@playwright/test";

/**
 * For local dev:remote, use localhost:5173.
 * For branch preview deploys, set PLAYWRIGHT_BASE_URL to the deployed URL
 * and disable webServer (set webServer: undefined or a no-op).
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

const authFile = "e2e/.auth/user.json";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 1,
	workers: process.env.CI ? 2 : 1,
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
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				storageState: authFile,
			},
			testMatch: /\.spec\.ts/,
			testIgnore: /auth\.spec\.ts/,
			dependencies: ["setup"],
		},
		{
			name: "auth",
			use: { ...devices["Desktop Chrome"] },
			testMatch: /auth\.spec\.ts/,
		},
	],
	webServer: {
		command: "bun run dev:remote",
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 180000,
	},
});
