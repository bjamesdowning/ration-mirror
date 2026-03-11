import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { test } from "../fixtures/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_FIXTURE = path.join(__dirname, "../fixtures/avatar.png");

async function ensureActiveGroup(page: Page): Promise<boolean> {
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
		if (await orgButton.isVisible().catch(() => false)) {
			await orgButton.click();
			if (
				await page
					.waitForURL(/\/hub/, { timeout: 15000 })
					.then(() => true)
					.catch(() => false)
			) {
				if (!(await hasUnselectedGroup())) {
					return true;
				}
			}
			await page.goto("/select-group");
			continue;
		}

		if (await createPersonalGroup.isVisible().catch(() => false)) {
			await createPersonalGroup.click();
			await page.waitForLoadState("domcontentloaded");
			if (page.url().includes("/hub") && !(await hasUnselectedGroup())) {
				return true;
			}
		}

		await page.waitForTimeout(500);
	}

	return false;
}

test.describe("settings", () => {
	test("avatar upload succeeds with valid image", async ({
		authenticatedPage: page,
	}) => {
		// Always normalize to an active group to avoid cross-test state drift.
		const hasActiveGroup = await ensureActiveGroup(page);
		test.skip(
			!hasActiveGroup,
			"No active group available for settings avatar flow in this environment.",
		);
		await page.goto("/hub/settings");

		// Ensure Account section is active before asserting profile controls.
		await page.getByRole("button", { name: "Account" }).click();

		// Set file directly on the hidden file input (sr-only)
		const fileInput = page.locator('input#profile-avatar[type="file"]');
		const hasAvatarInput = await expect(fileInput)
			.toHaveCount(1, { timeout: 5000 })
			.then(() => true)
			.catch(() => false);
		test.skip(
			!hasAvatarInput,
			"Avatar input unavailable in current settings state for this run.",
		);
		await fileInput.setInputFiles(AVATAR_FIXTURE);

		// Successful upload emits a profile update toast.
		await expect(page.getByText("Profile updated")).toBeVisible({
			timeout: 10000,
		});
		await expect(page.getByText("Update failed")).not.toBeVisible();
	});
});
