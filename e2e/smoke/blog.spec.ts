import { expect, test } from "@playwright/test";

test.describe("blog", () => {
	test("blog index loads and shows post list", async ({ page }) => {
		await page.goto("/blog");
		await expect(
			page.getByRole("heading", { name: "From the crew" }),
		).toBeVisible({
			timeout: 5000,
		});
		// At least one post link should be visible
		await expect(
			page.getByRole("link", { name: /Read →/ }).first(),
		).toBeVisible();
	});

	test("post link opens the post page", async ({ page }) => {
		test.setTimeout(90_000);
		await page.goto("/blog", { waitUntil: "domcontentloaded" });
		const link = page.getByRole("link", { name: /Read →/ }).first();
		await expect(link).toBeVisible();
		const href = await link.getAttribute("href");
		expect(href).toMatch(/\/blog\/.+/);
		// The first post visit can reload while Vite finishes markdown deps.
		// `load` never settles across that reload. Retry until the article is up.
		await expect(async () => {
			await page.goto(href ?? "/blog", { waitUntil: "domcontentloaded" });
			await expect(page).toHaveURL(/\/blog\/.+/);
			await expect(page.getByRole("article")).toBeVisible({ timeout: 5_000 });
		}).toPass({ timeout: 70_000 });
	});

	test("mermaid diagrams render on copilot blog posts", async ({ page }) => {
		test.setTimeout(60_000);
		await page.goto("/blog/agentic-app-control-copilot");
		await expect(page.getByRole("article")).toBeVisible({ timeout: 5000 });
		await expect(
			page.locator('article [aria-label="Diagram"] svg').first(),
		).toBeVisible({ timeout: 45_000 });
	});

	test("invalid slug returns 404 and error boundary", async ({ page }) => {
		await page.goto("/blog/nonexistent-slug-xyz-404");
		await expect(
			page.getByRole("heading", { name: "404 :: NOT FOUND" }),
		).toBeVisible({
			timeout: 5000,
		});
		await expect(
			page.getByText(
				"THE REQUESTED RESOURCE COULD NOT BE LOCATED IN THE DATABANKS.",
			),
		).toBeVisible();
	});
});
