import { describe, expect, it, vi } from "vitest";
import {
	applySplashDocumentTheme,
	restoreAppDocumentTheme,
} from "~/lib/splash-theme";

function createThemeRoot(initialDark = false) {
	const tokens = new Set<string>(initialDark ? ["dark"] : []);
	return {
		classList: {
			add: vi.fn((token: string) => {
				tokens.add(token);
			}),
			remove: vi.fn((token: string) => {
				tokens.delete(token);
			}),
			has: (token: string) => tokens.has(token),
		},
	};
}

describe("splash-theme", () => {
	it("applies light and dark document classes for the splash visit", () => {
		const root = createThemeRoot(true);
		applySplashDocumentTheme("light", root);
		expect(root.classList.remove).toHaveBeenCalledWith("dark");
		expect(root.classList.has("dark")).toBe(false);

		applySplashDocumentTheme("dark", root);
		expect(root.classList.add).toHaveBeenCalledWith("dark");
		expect(root.classList.has("dark")).toBe(true);
	});

	it("restores the app theme when leaving the splash route", () => {
		const root = createThemeRoot();
		applySplashDocumentTheme("light", root);
		expect(root.classList.has("dark")).toBe(false);

		restoreAppDocumentTheme("dark", root);
		expect(root.classList.has("dark")).toBe(true);

		restoreAppDocumentTheme("light", root);
		expect(root.classList.has("dark")).toBe(false);
	});
});
