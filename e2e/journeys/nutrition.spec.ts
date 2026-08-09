/**
 * Nutrition E2E journeys (foundation hardening Slice 11).
 *
 * Full Cook/Log split and privacy journeys activate when Flagship flags are
 * dogfooded. This file asserts flags-off Manifest still loads without
 * requiring nutrition UI.
 */
import { expect, test } from "@playwright/test";

test.describe("nutrition foundation (flags off by default)", () => {
	test("manifest page loads without cook/log split chrome", async ({
		page,
	}) => {
		await page.goto("/hub/manifest");
		await expect(page.getByRole("heading", { name: /manifest/i })).toBeVisible({
			timeout: 15000,
		});
		// Split flag default off — primary private log CTA must not appear.
		await expect(
			page.getByRole("button", { name: /log my serving/i }),
		).toHaveCount(0);
	});
});
