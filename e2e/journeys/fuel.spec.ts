/**
 * The shared server keeps nutrition-fuel-page off. A development-only request
 * header turns it on for the cap journey. Production ignores that header.
 */
import { expect, test } from "@playwright/test";

const goalsHeader = JSON.stringify({ "nutrition-goals": true });
const fuelHeader = JSON.stringify({
	"nutrition-fast-log": true,
	"nutrition-fuel-page": true,
});

async function grant(
	page: import("@playwright/test").Page,
	purpose: "goals" | "intake",
) {
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
		(row) => row.purpose === purpose,
	)?.statement;
	expect(statement).toBeTruthy();
	const granted = await page.request.post("/api/privacy/nutrition", {
		data: {
			action: "grant",
			purpose,
			policyVersion: statement?.policyVersion,
			statementVersion: statement?.statementVersion,
			statementSha256: statement?.sha256,
			affirmed: true,
			requestId: crypto.randomUUID(),
		},
	});
	expect(granted.ok()).toBeTruthy();
}

test.describe("fuel page flag off", () => {
	test("the phone and rail do not offer Fuel", async ({ page }) => {
		await page.goto("/hub");
		await expect(page.getByRole("link", { name: "Fuel" })).toHaveCount(0);
		await page.goto("/hub/fuel");
		await expect(page).not.toHaveURL(/\/hub\/fuel/);
		await expect(page.getByRole("button", { name: "Add Fuel" })).toHaveCount(0);
	});
});

test.describe("settings goals with the fuel page off", () => {
	test.use({ extraHTTPHeaders: { "x-ration-test-flags": goalsHeader } });

	test("saves a nutrition goal", async ({ page }) => {
		const enabled = await page.request.post("/api/privacy/features", {
			data: {
				action: "enable",
				feature: "macro",
				affirmed: true,
				requestId: crypto.randomUUID(),
			},
		});
		expect(enabled.ok()).toBeTruthy();
		await grant(page, "goals");
		await page.goto("/hub/settings#preferences");
		const calories = page.getByRole("spinbutton", { name: /kcal/i });
		await expect(calories).toBeVisible();
		await calories.fill("1800");
		const save = page.getByRole("button", { name: "Save goal" });
		await expect(save).toBeEnabled();
		await save.click();
		await expect(page.getByText(/Active from/)).toBeVisible();
	});
});

test.describe("fuel daily cap", () => {
	test.use({ extraHTTPHeaders: { "x-ration-test-flags": fuelHeader } });

	test("logs three meals and the fourth opens purchase", async ({ page }) => {
		test.setTimeout(60_000);
		await grant(page, "intake");
		const zone = await page.request.post("/hub/settings", {
			form: { intent: "update-fuel-timezone", fuelTimeZone: "Europe/Dublin" },
		});
		expect(zone.ok()).toBeTruthy();
		await page.goto("/hub/fuel");
		for (let n = 0; n < 6; n += 1) {
			const voids = page.getByRole("button", { name: /^Void / });
			const before = await voids.count();
			if (before === 0) break;
			await voids.first().click();
			await expect(voids).toHaveCount(before - 1);
		}
		for (const meal of ["Breakfast", "Lunch", "Dinner"]) {
			await page.getByRole("button", { name: "Add Fuel" }).click();
			await page.locator("input[name='name']").fill(meal);
			await page.locator("input[name='energyKcal']").fill("400");
			await page.getByRole("button", { name: "Save" }).click();
			await expect(page.getByText(meal)).toBeVisible();
		}
		await expect(page.getByText("3 of 3 meals logged")).toBeVisible();
		let leaked = false;
		await page.route("**/nutrition/diary/barcode", async (route) => {
			leaked = true;
			await route.abort();
		});
		await page.route("**/nutrition/diary/photo", async (route) => {
			leaked = true;
			await route.abort();
		});
		await page.getByRole("button", { name: "Barcode to Fuel" }).click();
		await expect(page).toHaveURL(/\/hub\/pricing/);
		expect(leaked).toBe(false);
	});
});
