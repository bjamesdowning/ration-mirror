import { expect, type Page } from "@playwright/test";
import { test } from "../fixtures/auth";
import { gotoHubPage } from "../helpers/hub";

// Supply mobile UI (shopping bar, stacked rows) is md:hidden — use phone viewport.
test.use({ viewport: { width: 390, height: 844 } });

async function openSupplyQuickAdd(page: Page) {
	const quickAdd = page.getByTestId("supply-quick-add");
	if (await quickAdd.isVisible()) return;
	await page.getByRole("button", { name: "Add Item" }).click();
	await expect(quickAdd).toBeVisible({ timeout: 5000 });
}

async function addSupplyItem(page: Page, itemName: string) {
	await openSupplyQuickAdd(page);
	const quickAdd = page.getByTestId("supply-quick-add");
	const nameInput = quickAdd.locator("#supply-item-name");
	await nameInput.click();
	await nameInput.pressSequentially(itemName, { delay: 10 });
	await quickAdd.getByRole("button", { name: "Add to Supply" }).click();
	await expect(supplyRow(page, itemName)).toBeVisible({ timeout: 10000 });
}

function supplyRow(page: Page, itemName: string) {
	return page
		.getByTestId("supply-item-row")
		.filter({ hasText: itemName })
		.first();
}

async function confirmPurchaseModal(page: Page) {
	await expect(
		page.getByRole("heading", { name: "What did you buy?" }),
	).toBeVisible({ timeout: 5000 });
	await page.getByRole("button", { name: /Use as listed/i }).click();
}

function supplyMobileRow(page: Page, itemName: string) {
	return supplyRow(page, itemName).locator("div.md\\:hidden").first();
}

async function removeSupplyItem(page: Page, itemName: string) {
	const row = supplyRow(page, itemName);
	await row.getByRole("button", { name: "Item actions" }).click();
	await page.getByRole("button", { name: "Remove from list" }).click();
	await page.getByRole("button", { name: "Remove", exact: true }).click();
	await expect(supplyRow(page, itemName)).toHaveCount(0, {
		timeout: 10000,
	});
}

test.describe("supply", () => {
	test.describe.configure({ mode: "serial" });

	test.beforeEach(async ({ authenticatedPage: page }) => {
		await gotoHubPage(page, "/hub/supply");
		await expect(page.getByRole("heading", { name: "Supply" })).toBeVisible({
			timeout: 15000,
		});
	});

	test("add and delete supply item with cleanup", async ({
		authenticatedPage: page,
	}) => {
		const itemName = `e2e-supply-${Date.now()}`;
		await addSupplyItem(page, itemName);
		await removeSupplyItem(page, itemName);
	});

	test("mark item as purchased with one tap", async ({
		authenticatedPage: page,
	}) => {
		const itemName = `e2e-supply-purchased-${Date.now()}`;
		await addSupplyItem(page, itemName);

		const row = supplyRow(page, itemName);

		await row.getByRole("button", { name: "Mark as purchased" }).click();
		await confirmPurchaseModal(page);

		await expect(
			row.getByRole("button", { name: "Mark as not purchased" }),
		).toBeVisible({ timeout: 5000 });

		await removeSupplyItem(page, itemName);
	});

	test("edit quantity inline then mark purchased", async ({
		authenticatedPage: page,
	}) => {
		const itemName = `e2e-supply-qty-${Date.now()}`;
		await addSupplyItem(page, itemName);

		const row = supplyMobileRow(page, itemName);

		await row.getByRole("button", { name: /Tap to edit/i }).click();
		await row.getByRole("spinbutton", { name: "Edit quantity" }).fill("3");
		await row.getByRole("spinbutton", { name: "Edit quantity" }).press("Enter");

		await row.getByRole("button", { name: "Mark as purchased" }).click();
		await confirmPurchaseModal(page);
		await expect(
			row.getByRole("button", { name: "Mark as not purchased" }),
		).toBeVisible({ timeout: 5000 });

		await removeSupplyItem(page, itemName);
	});

	test("item actions sheet shows item name and manual source", async ({
		authenticatedPage: page,
	}) => {
		const itemName = `e2e-supply-actions-${Date.now()}`;
		await addSupplyItem(page, itemName);

		const row = supplyRow(page, itemName);
		await row.getByRole("button", { name: "Item actions" }).click();

		await expect(page.getByRole("heading", { name: itemName })).toBeVisible({
			timeout: 5000,
		});
		await expect(
			page.getByTestId("supply-item-actions-sheet").getByText("Added manually"),
		).toBeVisible();
		await page.getByRole("button", { name: "Cancel" }).click();

		await removeSupplyItem(page, itemName);
	});

	test("domain filter in options sheet filters items", async ({
		authenticatedPage: page,
	}) => {
		const itemName = `e2e-supply-domain-${Date.now()}`;
		await addSupplyItem(page, itemName);

		await page.getByRole("button", { name: "More options" }).click();
		await expect(page.getByRole("heading", { name: "Filters" })).toBeVisible({
			timeout: 5000,
		});
		await page.getByRole("button", { name: "Household" }).click();
		await expect(supplyRow(page, itemName)).toHaveCount(0, {
			timeout: 5000,
		});

		await page.getByRole("button", { name: "Food" }).click();
		await expect(supplyRow(page, itemName)).toBeVisible({ timeout: 5000 });

		await page.keyboard.press("Escape");
		await removeSupplyItem(page, itemName);
	});

	test("default A-Z sort orders items alphabetically", async ({
		authenticatedPage: page,
	}) => {
		const suffix = Date.now();
		const zebra = `e2e-zebra-${suffix}`;
		const apple = `e2e-apple-${suffix}`;

		await addSupplyItem(page, zebra);
		await addSupplyItem(page, apple);

		const rows = page
			.getByTestId("supply-item-row")
			.filter({ hasText: String(suffix) });
		await expect(rows).toHaveCount(2);

		const names = await rows
			.locator(".md\\:hidden .truncate")
			.allTextContents();
		const appleIndex = names.findIndex((n) =>
			n.toLowerCase().includes("apple"),
		);
		const zebraIndex = names.findIndex((n) =>
			n.toLowerCase().includes("zebra"),
		);
		expect(appleIndex).toBeGreaterThanOrEqual(0);
		expect(zebraIndex).toBeGreaterThanOrEqual(0);
		expect(appleIndex).toBeLessThan(zebraIndex);

		await removeSupplyItem(page, apple);
		await removeSupplyItem(page, zebra);
	});
});
