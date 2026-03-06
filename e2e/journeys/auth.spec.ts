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
		await page.goto("/");
		await page.getByLabel("Email address").fill("test@example.com");
		// Note: in local dev the form posts but no email is sent, the UI should
		// still transition to the "sent" state. We mock the auth endpoint to
		// return a 200 OK so the test doesn't depend on an external service.
		await page.route("**/api/auth/magic-link/send**", (route) => {
			route.fulfill({ status: 200, body: JSON.stringify({ status: true }) });
		});
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
		await page.getByLabel("Email address").fill("not-an-email");
		const btn = page.getByRole("button", { name: /send sign-up link/i });
		await expect(btn).toBeDisabled();
	});
});
