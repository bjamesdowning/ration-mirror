import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_FIXTURE = path.join(__dirname, "../fixtures/avatar.png");

test.describe("settings", () => {
	test("avatar upload succeeds with valid image", async ({
		authenticatedPage: page,
	}) => {
		await page.goto("/hub/settings");

		// Ensure Account section is active before asserting profile controls.
		await page.getByRole("button", { name: "Account" }).click();

		// Set file directly on the hidden file input (sr-only)
		const fileInput = page.locator('input#profile-avatar[type="file"]');
		await expect(fileInput).toHaveCount(1, { timeout: 5000 });
		await fileInput.setInputFiles(AVATAR_FIXTURE);

		// Successful upload emits a profile update toast.
		await expect(page.getByText("Profile updated")).toBeVisible({
			timeout: 10000,
		});
		await expect(page.getByText("Update failed")).not.toBeVisible();
	});
});
