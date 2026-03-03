import { expect, test } from "@playwright/test";

test.describe("auth", () => {
	test("home page shows Dev Login when unauthenticated", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByRole("button", { name: "Dev Login" })).toBeVisible();
	});

	test("Dev Login redirects to hub or select-group", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Dev Login" }).click();
		await page.waitForURL(/\/(hub|select-group)/, { timeout: 10000 });
		const url = page.url();
		expect(url).toMatch(/\/(hub|select-group)/);
	});

	test("select-group shows org list or create button", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Dev Login" }).click();
		await page.waitForURL(/\/(hub|select-group)/, { timeout: 10000 });

		if (page.url().includes("select-group")) {
			const hasOrgList = await page
				.getByRole("button", { name: /My Personal|personal/i })
				.first()
				.isVisible()
				.catch(() => false);
			const hasCreate = await page
				.getByRole("button", { name: "Create Personal Group" })
				.isVisible()
				.catch(() => false);
			expect(hasOrgList || hasCreate).toBeTruthy();
		}
	});
});
