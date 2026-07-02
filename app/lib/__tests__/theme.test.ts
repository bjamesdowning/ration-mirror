import { describe, expect, it } from "vitest";
import { resolveAppTheme } from "~/lib/theme";

describe("resolveAppTheme", () => {
	it("prefers session theme for authenticated users", () => {
		expect(
			resolveAppTheme({
				isAuthenticated: true,
				sessionTheme: "dark",
				cookieTheme: "light",
			}),
		).toBe("dark");
	});

	it("falls back to cookie for authenticated users without session theme", () => {
		expect(
			resolveAppTheme({
				isAuthenticated: true,
				cookieTheme: "light",
			}),
		).toBe("light");
	});

	it("defaults to dark for authenticated users with no preference", () => {
		expect(
			resolveAppTheme({
				isAuthenticated: true,
			}),
		).toBe("dark");
	});

	it("uses cookie only for guests", () => {
		expect(
			resolveAppTheme({
				isAuthenticated: false,
				sessionTheme: "dark",
				cookieTheme: "light",
			}),
		).toBe("light");
	});

	it("defaults to dark for guests without cookie", () => {
		expect(
			resolveAppTheme({
				isAuthenticated: false,
			}),
		).toBe("dark");
	});
});
