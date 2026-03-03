import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { test as setup } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

// Ensure auth dir exists before saving (Playwright does not create parent dirs)
mkdirSync(dirname(authFile), { recursive: true });

/**
 * Runs once before all tests. Logs in via Dev Login, selects group if needed,
 * and saves storage state. Other tests reuse this state — no per-test login.
 */
setup("authenticate", async ({ page }) => {
	await page.goto("/");
	await page
		.getByRole("button", { name: "Dev Login" })
		.waitFor({ state: "visible" });
	await page.getByRole("button", { name: "Dev Login" }).click();
	await page.waitForURL(/\/(hub|select-group)/, { timeout: 60000 });

	if (page.url().includes("select-group")) {
		const selectBtn = page.getByRole("button", {
			name: /select|create|personal/i,
		});
		await selectBtn.first().click();
		await page.waitForURL("/hub", { timeout: 10000 });
	}

	await page.context().storageState({ path: authFile });
});
