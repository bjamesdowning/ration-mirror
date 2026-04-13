import { expect, test } from "@playwright/test";

test.describe("auth", () => {
	test("home page shows email input for magic link", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByLabel("Email address")).toBeVisible();
		await expect(
			page.getByRole("button", { name: /send sign-up link/i }),
		).toBeVisible();
	});

	test("switching to Sign In tab changes button label", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("tab", { name: "Sign In" }).click();
		await expect(
			page.getByRole("button", { name: /send sign-in link/i }),
		).toBeVisible();
	});

	test("submitting email shows check-inbox success state", async ({ page }) => {
		// Better Auth magic-link client posts to `/api/auth/sign-in/magic-link` (not `magic-link/send`).
		// Register before navigation so the handler is always in place under parallel workers.
		await page.route("**/api/auth/sign-in/magic-link", (route) => {
			if (route.request().method() !== "POST") {
				route.continue();
				return;
			}
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ status: true }),
			});
		});
		await page.goto("/");
		await page.getByLabel("Email address").fill("test@example.com");
		// Clickwrap: must agree to ToS/Privacy before submit is enabled
		await page
			.getByRole("checkbox", {
				name: /agree to the Terms of Service and Privacy Policy/i,
			})
			.check();
		await page.getByRole("button", { name: /send sign-up link/i }).click();
		await expect(page.getByText("Check your inbox")).toBeVisible({
			timeout: 5000,
		});
		await expect(page.getByText("test@example.com")).toBeVisible();
	});

	test("empty email keeps submit button disabled", async ({ page }) => {
		await page.goto("/");
		const btn = page.getByRole("button", { name: /send sign-up link/i });
		await expect(btn).toBeDisabled();
	});

	test("auth/verify shows error state for invalid token", async ({ page }) => {
		await page.goto("/auth/verify?error=INVALID_TOKEN");
		await expect(page.getByText("Link Invalid")).toBeVisible();
		await expect(
			page.getByText(/invalid or has already been used/i),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: /request a new link/i }),
		).toBeVisible();
	});

	test("auth/verify redirects unauthenticated users to root", async ({
		page,
	}) => {
		// Visiting /auth/verify without error and without session redirects to /
		await page.goto("/auth/verify");
		await expect(page).toHaveURL((url) => new URL(url).pathname === "/", {
			timeout: 5000,
		});
	});

	test("invalid email keeps submit button disabled", async ({ page }) => {
		await page.goto("/");
		await page
			.getByRole("checkbox", {
				name: /agree to the Terms of Service and Privacy Policy/i,
			})
			.check();
		await page.getByLabel("Email address").fill("not-an-email");
		const btn = page.getByRole("button", { name: /send sign-up link/i });
		await expect(btn).toBeDisabled();
	});
});
