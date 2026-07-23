import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, type Page, test as setup } from "@playwright/test";
import {
	dismissOnboardingTourIfVisible,
	waitForHubStyles,
} from "./helpers/hub";

const authFile = "e2e/.auth/user.json";

// Ensure auth dir exists before saving (Playwright does not create parent dirs)
mkdirSync(dirname(authFile), { recursive: true });

async function ensureActiveGroup(page: Page) {
	await page.goto("/select-group");

	const createPersonalGroup = page.getByRole("button", {
		name: "Create Personal Group",
	});
	const hasUnselectedGroup = async () =>
		page
			.getByRole("button", { name: /Select Group/i })
			.isVisible()
			.catch(() => false);
	for (let attempt = 0; attempt < 20; attempt++) {
		const orgButton = page
			.locator("div.space-y-3 button")
			.filter({ hasNotText: "Create Personal Group" })
			.first();
		if (await orgButton.isVisible({ timeout: 1000 }).catch(() => false)) {
			await orgButton.click();
			if (
				await page
					.waitForURL(/\/hub/, { timeout: 15000 })
					.then(() => true)
					.catch(() => false)
			) {
				if (!(await hasUnselectedGroup())) {
					return;
				}
			}
			await page.goto("/select-group");
			continue;
		}

		if (await createPersonalGroup.isVisible().catch(() => false)) {
			await createPersonalGroup.click();
			await page.waitForLoadState("domcontentloaded");
			if (page.url().includes("/hub") && !(await hasUnselectedGroup())) {
				return;
			}
		}
		await page.waitForTimeout(500);
	}

	throw new Error("Failed to ensure an active group for E2E auth setup.");
}

/**
 * Runs once before all tests. Logs in via Dev Login, selects group if needed,
 * and saves storage state. Other tests reuse this state — no per-test login.
 */
setup("authenticate", async ({ page }) => {
	setup.setTimeout(90_000);
	await page.goto("/");
	await page
		.getByRole("button", { name: "Dev Login" })
		.waitFor({ state: "visible" });
	await page.getByRole("button", { name: "Dev Login" }).click();
	const landed = await page
		.waitForURL(/\/(hub|select-group)/, { timeout: 45_000 })
		.then(() => true)
		.catch(() => false);
	// signUp.email may establish the session without a client-side navigation
	// when the D1 user is created for the first time after a local reset.
	if (!landed) {
		await page.goto("/hub");
	}

	if (page.url().includes("select-group")) {
		await ensureActiveGroup(page);
	}

	await page.goto("/hub", { waitUntil: "networkidle" });
	await waitForHubStyles(page);
	const selectGroupSwitcher = page.getByRole("button", {
		name: /Select Group/i,
	});
	if (await selectGroupSwitcher.isVisible().catch(() => false)) {
		await ensureActiveGroup(page);
		await page.goto("/hub");
	}

	// Persist a clean auth state with onboarding dismissed to prevent overlays
	// from intercepting interactions in journey tests.
	await dismissOnboardingTourIfVisible(page);
	if (
		await page
			.getByRole("dialog", { name: "Onboarding tour" })
			.isVisible()
			.catch(() => false)
	) {
		await page.reload({ waitUntil: "networkidle" });
		await waitForHubStyles(page);
		await dismissOnboardingTourIfVisible(page);
	}
	const onboardingDialog = page.getByRole("dialog", {
		name: "Onboarding tour",
	});
	await expect(onboardingDialog).toBeHidden({ timeout: 10_000 });

	// Marketing homepage also has a sticky header, so waitForHubStyles alone is
	// not proof of auth. Fail loudly if Dev Login did not establish a session.
	await expect(page).toHaveURL(/\/hub(\/|$)/, { timeout: 10_000 });
	await expect(page.locator('aside a[href="/hub/cargo"]')).toBeVisible({
		timeout: 15_000,
	});
	const cookies = await page.context().cookies();
	expect(
		cookies.some(
			(cookie) =>
				cookie.name.includes("session") ||
				cookie.name.includes("better-auth") ||
				cookie.name.startsWith("__Secure-"),
		),
		`Expected session cookies after Dev Login; got: ${cookies
			.map((c) => c.name)
			.join(", ") || "(none)"}`,
	).toBe(true);

	await page.context().storageState({ path: authFile });
});
