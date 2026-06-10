import { expect, test } from "@playwright/test";

/**
 * OAuth MCP browser flow smoke tests.
 * Full authorize → callback requires a live MCP client; these tests validate
 * route guards, dark-mode shell, and public OAuth entry behavior on the app worker.
 */
test.describe("MCP OAuth routes", () => {
	test("sign-in without oauth_query shows guidance", async ({ page }) => {
		await page.goto("/oauth/sign-in");
		await expect(
			page.getByText(/start the connection from your ai client/i),
		).toBeVisible();
	});

	test("sign-in page uses theme-aware card (not hardcoded white panel)", async ({
		page,
	}) => {
		await page.goto("/oauth/sign-in");
		const card = page.locator(".glass-panel").first();
		await expect(card).toBeVisible();
		const bg = await card.evaluate(
			(el) => getComputedStyle(el).backgroundColor,
		);
		expect(bg).not.toBe("rgb(255, 255, 255)");
	});

	test("select-org without signed oauth_query shows flow error", async ({
		page,
	}) => {
		await page.goto("/oauth/select-org");
		await expect(
			page.getByText(/missing authorization session|authorization link/i),
		).toBeVisible();
	});

	test("consent without signed oauth_query redirects safely", async ({
		page,
	}) => {
		const res = await page.goto(
			"/oauth/consent?oauth_query=client_id%3Dtest%26scope%3Dmcp%3Aread",
		);
		expect(res?.status()).toBeLessThan(500);
	});
});
