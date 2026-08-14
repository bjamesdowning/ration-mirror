import { expect, test } from "@playwright/test";

test.describe("home", () => {
	test("home page loads with hero and key links", async ({ page }) => {
		await page.goto("/");
		await expect(
			page.getByRole("heading", {
				name: /Most kitchen apps do one job\.\s*Ration runs the week\./i,
			}),
		).toBeVisible({ timeout: 5000 });
		await expect(
			page.getByText(/Pantry.*Meals.*Shopping.*Macros/i).first(),
		).toBeVisible();
		await expect(page.getByRole("banner").getByText("Ration")).toBeVisible();
		await expect(
			page.locator(".splash-brand-mark, .splash-brand img").first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: /Get Ration on the App Store/i }),
		).toBeVisible();
		const explainerButton = page.getByRole("button", {
			name: /Play the Ration explainer video/i,
		});
		await expect(explainerButton).toBeVisible();
		await expect(
			page.getByText(/Watch the 90-second tour/i).first(),
		).toBeVisible();
		await explainerButton.click();
		await expect(page.getByTitle("Ration explainer video")).toHaveAttribute(
			"src",
			/https:\/\/www\.youtube-nocookie\.com\/embed\/yWXekcWGQQA/,
		);
		await expect(
			page.getByRole("heading", {
				name: /One loop: Cargo.*Galley.*Manifest.*Supply.*Dock/i,
			}),
		).toBeVisible();
		await expect(
			page.getByRole("heading", {
				name: /Cook for the house\. Log your plate\./i,
			}),
		).toBeVisible();
		await expect(
			page.getByRole("heading", {
				name: /Home, a sharehouse, a second place you cook\./i,
			}),
		).toBeVisible();
		const interfaces = page.locator("#interfaces .splash-interface");
		await expect(interfaces).toHaveCount(3);
		await expect(interfaces.nth(0)).toContainText("iOS + Copilot");
		await expect(interfaces.nth(1)).toContainText("Web + Copilot");
		await expect(interfaces.nth(2)).toContainText("MCP");
		await expect(
			page.getByRole("link", { name: "Docs" }).first(),
		).toBeVisible();
		const lightMode = page.getByRole("button", { name: "Light mode" }).first();
		const darkMode = page.getByRole("button", { name: "Dark mode" }).first();
		await expect(lightMode).toBeVisible();
		await expect(darkMode).toBeVisible();
		await lightMode.click();
		await expect(page.locator("html")).not.toHaveClass(/dark/);
		await darkMode.click();
		await expect(page.locator("html")).toHaveClass(/dark/);
		await expect(
			page.getByRole("link", { name: "Blog" }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Tools" }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "YouTube", exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Privacy Policy" }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Terms of Service" }).first(),
		).toBeVisible();
	});
});
