import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

test.describe("manifest", () => {
	test("manifest page loads and shows week view", async ({
		authenticatedPage: page,
	}) => {
		await page.goto("/hub/manifest");

		// Week navigator or calendar should be visible
		await expect(
			page.getByRole("button", { name: /Previous|Next|week/i }).first(),
		).toBeVisible({ timeout: 5000 });
	});
});
