import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCAN_FIXTURE = path.join(__dirname, "../fixtures/sample-scan.png");

test.describe("scan", () => {
	test("scan flow: FAB opens modal, upload with mock returns results", async ({
		authenticatedPage: page,
	}) => {
		const requestId = `e2e-scan-${Date.now()}`;
		const mockResult = {
			status: "completed" as const,
			items: [
				{
					id: "e2e-item-1",
					name: "E2E Test Item",
					quantity: 1,
					unit: "unit",
					domain: "food",
					tags: [],
					selected: true,
				},
			],
			metadata: {
				source: "image",
				processedAt: new Date().toISOString(),
			},
		};

		// Mock POST /api/scan -> return requestId
		await page.route("**/api/scan", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						status: "processing",
						requestId,
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Mock GET /api/scan/status/:requestId -> return completed result
		await page.route(/\/api\/scan\/status\/.+/, async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(mockResult),
			});
		});

		await page.goto("/hub/cargo");

		// Open scan: FAB or toolbar "Scan" button
		await page.getByRole("button", { name: /Scan/ }).first().click();

		// ScanIntroModal opens
		await expect(
			page.getByRole("dialog", { name: /Scan to add items|scan-intro/i }),
		).toBeVisible({ timeout: 5000 });

		const continueButton = page.getByRole("button", { name: "Continue" });
		if (await continueButton.isVisible().catch(() => false)) {
			// Continue opens file chooser — capture and set file
			const fileChooserPromise = page.waitForEvent("filechooser");
			await continueButton.click();
			const fileChooser = await fileChooserPromise;
			await fileChooser.setFiles(SCAN_FIXTURE);
		} else {
			// Some local accounts start at 0 credits; intro modal then shows Pricing.
			// In this state, verify gate behavior and exit without forcing a paid flow.
			await expect(page.getByRole("link", { name: "Pricing" })).toBeVisible({
				timeout: 5000,
			});
			return;
		}

		// Wait for scan result modal (items detected)
		await expect(page.getByText("E2E Test Item")).toBeVisible({
			timeout: 10000,
		});
	});
});
