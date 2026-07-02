export type AppTheme = "light" | "dark";

/**
 * Resolves the active UI theme for SSR and client hydration.
 * Logged-in users: session/DB wins over cookie (mobile may PATCH without
 * refreshing the web cookie). Guests: cookie only.
 */
export function resolveAppTheme(options: {
	isAuthenticated: boolean;
	sessionTheme?: AppTheme;
	cookieTheme?: AppTheme;
}): AppTheme {
	const { isAuthenticated, sessionTheme, cookieTheme } = options;
	return isAuthenticated
		? (sessionTheme ?? cookieTheme ?? "dark")
		: (cookieTheme ?? "dark");
}
