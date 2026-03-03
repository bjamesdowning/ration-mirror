import type { Page } from "@playwright/test";
import { test as base } from "@playwright/test";

/**
 * Authenticated page fixture. Uses storage state from auth.setup.ts (one-time login).
 * Tests that use this fixture run in the "chromium" project which loads the saved session.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
	authenticatedPage: async ({ page }, use) => {
		await use(page);
	},
});

export { expect } from "@playwright/test";
