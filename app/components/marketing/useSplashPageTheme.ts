import { useEffect, useState } from "react";
import type { SplashPageTheme } from "~/components/marketing/SplashThemeToggle";
import {
	applySplashDocumentTheme,
	restoreAppDocumentTheme,
} from "~/lib/splash-theme";

export type { SplashPageTheme };

/**
 * Local appearance for the public home/splash route only.
 * Syncs `document.documentElement` while mounted so portals and body tokens
 * match, then restores the app theme on leave — never writes the theme cookie
 * or hub settings.
 */
export function useSplashPageTheme(globalTheme: SplashPageTheme) {
	const [theme, setTheme] = useState<SplashPageTheme>(globalTheme);

	useEffect(() => {
		setTheme(globalTheme);
	}, [globalTheme]);

	useEffect(() => {
		applySplashDocumentTheme(theme);
	}, [theme]);

	useEffect(() => {
		return () => {
			restoreAppDocumentTheme(globalTheme);
		};
	}, [globalTheme]);

	return [theme, setTheme] as const;
}
