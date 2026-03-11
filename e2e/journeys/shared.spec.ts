import { expect, test } from "@playwright/test";

test.describe("shared links (error path)", () => {
	test("invalid supply list token returns 404", async ({ page }) => {
		const response = await page.goto("/shared/invalid-token-xyz");
		expect(response?.status()).toBe(404);
	});

	test("invalid manifest token returns 404", async ({ page }) => {
		const response = await page.goto("/shared/manifest/invalid-token-xyz");
		expect(response?.status()).toBe(404);
	});
});
