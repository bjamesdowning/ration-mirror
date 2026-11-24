/**
 * Cooked Manifest plate-up hitting the free Fuel cap opens Crew and keeps
 * the meal cooked. The intake write is mocked: a meal without a nutrition
 * snapshot fails before the cap.
 */
import { expect, type Page, test } from "@playwright/test";
import { cleanupE2eMeals, deleteMealById } from "../helpers/cleanup";
import { gotoHubPage, openPanelQuickAdd } from "../helpers/hub";

const manifestFuelHeader = JSON.stringify({
	"nutrition-engine": true,
	"nutrition-manifest": true,
	"nutrition-cook-log-split": true,
	"nutrition-fast-log": true,
	"nutrition-fuel-page": true,
});

async function grantIntake(page: Page) {
	const privacy = await page.request.get("/api/privacy/nutrition");
	const body = (await privacy.json()) as {
		consents?: Array<{
			purpose: string;
			statement?: {
				policyVersion: string;
				statementVersion: string;
				sha256: string;
			};
		}>;
	};
	const statement = body.consents?.find(
		(row) => row.purpose === "intake",
	)?.statement;
	expect(statement).toBeTruthy();
	const granted = await page.request.post("/api/privacy/nutrition", {
		data: {
			action: "grant",
			purpose: "intake",
			policyVersion: statement?.policyVersion,
			statementVersion: statement?.statementVersion,
			statementSha256: statement?.sha256,
			affirmed: true,
			requestId: crypto.randomUUID(),
		},
	});
	expect(granted.ok()).toBeTruthy();
}

async function addMealToManifest(page: Page, name: string) {
	await gotoHubPage(page, "/hub/galley");
	await openPanelQuickAdd(page);
	await page.getByRole("button", { name: "Recipe" }).click();
	await page.getByLabel("Meal Name").fill(name);
	await page.getByRole("button", { name: "Create Meal" }).click();
	await expect(page).toHaveURL(/\/hub\/galley\/.+/);
	const mealId = page.url().split("/").pop() ?? "";
	await gotoHubPage(page, "/hub/manifest");
	await page
		.getByRole("button", {
			name: /^Plus( (Breakfast|Lunch|Dinner|Snack))?$/,
		})
		.first()
		.click();
	await expect(page.getByRole("heading", { name: "Add Meal" })).toBeVisible();
	await page
		.getByRole("button", {
			name: new RegExp(`^${name}\\s+\\d+\\s+srv$`),
		})
		.first()
		.click();
	await page
		.getByRole("button", { name: /Add to (Breakfast|Lunch|Dinner|Snack)/ })
		.click();
	await expect(
		page.getByRole("button", { name: `Remove ${name}` }).first(),
	).toBeVisible();
	return mealId;
}

async function openCookedPlate(page: Page, name: string) {
	const plate = page.getByRole("dialog", { name: "Log my serving" });
	if (await plate.isVisible().catch(() => false)) return plate;
	const cook = page.getByRole("button", {
		name: `Cook ${name} (deduct from Cargo)`,
	});
	if (await cook.count()) {
		await cook.first().click();
		const anyway = page.getByRole("button", { name: "Cook anyway" });
		await expect(plate.or(anyway)).toBeVisible({ timeout: 20_000 });
		if (await anyway.isVisible().catch(() => false)) {
			await anyway.click();
		}
	} else {
		await page
			.getByRole("button", { name: `Log my serving for ${name}` })
			.first()
			.click();
	}
	await expect(plate).toBeVisible({ timeout: 20_000 });
	return plate;
}

test.describe("manifest fuel cap", () => {
	test.use({ extraHTTPHeaders: { "x-ration-test-flags": manifestFuelHeader } });

	test("a full day opens Crew and a later save still logs", async ({ page }) => {
		test.setTimeout(180_000);
		const name = `e2e-manifest-fuel-${Date.now()}`;
		let mealId = "";
		let mode: "limit" | "saved" | "invalid" = "limit";
		await page.route("**/api/meal-plans/**/entries/**/intake", async (route) => {
			if (route.request().method() !== "POST") {
				await route.continue();
				return;
			}
			if (mode === "saved") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						intake: {
							id: "e2e-intake",
							servings: 1,
							energyKcal: 100,
							proteinG: 1,
							carbsG: 1,
							fatG: 1,
							occurredAt: new Date().toISOString(),
						},
					}),
				});
				return;
			}
			if (mode === "invalid") {
				await route.fulfill({
					status: 400,
					contentType: "application/json",
					body: JSON.stringify({
						error: "Invalid request",
						code: "invalid_request",
					}),
				});
				return;
			}
			await route.fulfill({
				status: 403,
				contentType: "application/json",
				body: JSON.stringify({
					error: "Daily Fuel limit reached",
					code: "fuel_daily_limit",
					upgradeRequired: true,
					limit: 3,
					used: 3,
				}),
			});
		});

		try {
			await cleanupE2eMeals(page);
			await grantIntake(page);
			mealId = await addMealToManifest(page, name);

			const plate = await openCookedPlate(page, name);
			await expect(plate.getByText(name)).toBeVisible();
			await expect(page.getByText(/You logged/)).toHaveCount(0);
			await plate.getByRole("button", { name: "Save" }).click();

			const crew = page.getByRole("dialog", { name: "Crew" });
			await expect(crew).toBeVisible();
			await expect(crew.getByRole("link", { name: "See Crew" })).toHaveAttribute(
				"href",
				"/hub/pricing",
			);
			await expect(plate).toBeVisible();
			await expect(page.getByText("Couldn't log serving")).toHaveCount(0);
			await expect(page.getByText(/You logged/)).toHaveCount(0);
			await expect(page).toHaveURL(/\/hub\/manifest/);
			await crew.getByRole("button", { name: "Close" }).click();
			await expect(crew).toBeHidden();
			await expect(plate).toBeVisible();

			await plate.getByRole("button", { name: "Not now" }).click();
			await expect(plate).toBeHidden();
			await expect(page.getByText("Prepared").first()).toBeVisible();
			await page
				.getByRole("button", { name: `Log my serving for ${name}` })
				.first()
				.click();
			await expect(plate).toBeVisible();
			await plate.getByRole("button", { name: "Save" }).click();
			await expect(crew).toBeVisible();
			await expect(plate).toBeVisible();
			await expect(page.getByText(/You logged/)).toHaveCount(0);
			await crew.getByRole("button", { name: "Close" }).click();

			mode = "saved";
			await plate.getByRole("button", { name: "Save" }).click();
			await expect(plate).toBeHidden();
			await expect(crew).toBeHidden();
			await expect(page.getByText("Serving logged")).toBeVisible();
			await expect(page.getByText("Prepared").first()).toBeVisible();

			mode = "invalid";
			await page
				.getByRole("button", { name: `Log my serving for ${name}` })
				.first()
				.click();
			await expect(plate).toBeVisible();
			await plate.getByRole("button", { name: "Save" }).click();
			await expect(page.getByText("Couldn't log serving")).toBeVisible();
			await expect(plate).toBeHidden();
			await expect(crew).toHaveCount(0);
		} finally {
			if (mealId) await deleteMealById(page, mealId);
		}
	});
});
