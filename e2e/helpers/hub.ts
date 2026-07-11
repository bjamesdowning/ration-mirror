import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Waits until Tailwind styles are applied (sticky hub header). */
export async function waitForHubStyles(page: Page) {
	await page.waitForFunction(
		() => {
			const header = document.querySelector("header");
			if (!header) return false;
			const position = getComputedStyle(header).position;
			return position === "sticky" || position === "-webkit-sticky";
		},
		undefined,
		{ timeout: 20_000 },
	);
}

/** Dismisses the web onboarding overlay if it is blocking hub interactions. */
export async function dismissOnboardingTourIfVisible(page: Page) {
	const onboardingDialog = page.getByRole("dialog", {
		name: "Onboarding tour",
	});
	if (!(await onboardingDialog.isVisible().catch(() => false))) {
		return;
	}

	const persistResponse = page.waitForResponse(
		(resp) =>
			resp.url().includes("/hub/settings") &&
			resp.request().method() === "POST" &&
			resp.ok(),
		{ timeout: 15_000 },
	);
	await page.keyboard.press("Escape");
	await persistResponse;
	await expect(onboardingDialog).toBeHidden({ timeout: 10_000 });
}

/** Navigate to a hub route only after the client shell is hydrated and styled. */
export async function gotoHubPage(page: Page, path: string) {
	await page.goto(path, { waitUntil: "networkidle" });
	await waitForHubStyles(page);
	await dismissOnboardingTourIfVisible(page);
}

/** Opens the desktop panel quick-add form (Cargo / Galley toolbar). */
export async function openPanelQuickAdd(page: Page) {
	const toggle = page.getByTestId("panel-quick-add-toggle");
	await expect(toggle).toBeVisible({ timeout: 10_000 });
	await toggle.click();
	await expect(toggle).toHaveAccessibleName(/Cancel/i, { timeout: 5_000 });
}
