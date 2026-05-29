import { expect, test } from "@playwright/test";

/**
 * OAuth MCP browser flow smoke tests.
 * Full authorize → callback requires a live MCP client; these tests validate
 * route guards and public OAuth entry behavior on the app worker.
 */
test.describe("MCP OAuth routes", () => {
	test("sign-in without oauth_query shows guidance", async ({ page }) => {
		await page.goto("/oauth/sign-in");
		await expect(
			page.getByText(/start the connection from your ai client/i),
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
