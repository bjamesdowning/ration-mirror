import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, type Page, test as setup } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

// Ensure auth dir exists before saving (Playwright does not create parent dirs)
mkdirSync(dirname(authFile), { recursive: true });

async function ensureActiveGroup(page: Page) {
	await page.goto("/select-group");

	const createPersonalGroup = page.getByRole("button", {
		name: "Create Personal Group",
	});
	for (let attempt = 0; attempt < 3; attempt++) {
		const orgButton = page.locator(".space-y-3 > button").first();
		if (await orgButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await orgButton.click();
			await page.waitForURL(/\/hub/, { timeout: 10000 });
			return;
		}

		if (await createPersonalGroup.isVisible().catch(() => false)) {
			await createPersonalGroup.click();
			await page.waitForTimeout(500);
		}
	}

	throw new Error("Failed to ensure an active group for E2E auth setup.");
}

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
		await ensureActiveGroup(page);
	}

	await page.goto("/hub");
	const selectGroupSwitcher = page.getByRole("button", {
		name: /Select Group/i,
	});
	if (await selectGroupSwitcher.isVisible().catch(() => false)) {
		await ensureActiveGroup(page);
		await page.goto("/hub");
	}

	// Persist a clean auth state with onboarding dismissed to prevent overlays
	// from intercepting interactions in journey tests.
	const onboardingDialog = page.getByRole("dialog", {
		name: "Onboarding tour",
	});
	if (await onboardingDialog.isVisible().catch(() => false)) {
		await onboardingDialog
			.getByRole("button", { name: /Skip tour/i })
			.first()
			.click();
		await expect(onboardingDialog).toBeHidden({ timeout: 10000 });
	}

	await page.context().storageState({ path: authFile });
});
