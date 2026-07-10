import { expect, test } from "@playwright/test";

test.describe("home", () => {
	test("home page loads with hero and key links", async ({ page }) => {
		await page.goto("/");
		await expect(
			page.getByRole("heading", {
				name: /Your kitchen, operable by AI/i,
			}),
		).toBeVisible({ timeout: 5000 });
		await expect(
			page.getByText(/AI pantry management.*MCP native/i).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: /Start free/i }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: /Connect an AI agent/i }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("heading", {
				name: /A pantry that keeps its own context/i,
			}),
		).toBeVisible();
		await expect(page.getByText("Ration Copilot").first()).toBeVisible();
		await expect(page.getByText("MCP control").first()).toBeVisible();
		await expect(
			page.getByRole("heading", {
				name: /The full loop, wherever dinner happens/i,
			}),
		).toBeVisible();
		await expect(page.getByLabel("iOS app coming soon")).toBeVisible();
		// Key footer/header links
		await expect(
			page.getByRole("link", { name: "Blog" }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Tools" }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Privacy Policy" }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Terms of Service" }).first(),
		).toBeVisible();
	});
});
