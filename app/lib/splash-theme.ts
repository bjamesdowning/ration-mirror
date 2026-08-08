import type { SplashPageTheme } from "~/components/marketing/SplashThemeToggle";

export type { SplashPageTheme };

export type ThemeClassRoot = {
	classList: {
		add: (token: string) => void;
		remove: (token: string) => void;
	};
};

function resolveThemeRoot(root?: ThemeClassRoot): ThemeClassRoot {
	return root ?? document.documentElement;
}

/** Apply a splash-only appearance to the document root (in-memory for this visit). */
export function applySplashDocumentTheme(
	theme: SplashPageTheme,
	root?: ThemeClassRoot,
): void {
	const html = resolveThemeRoot(root);
	if (theme === "dark") {
		html.classList.add("dark");
	} else {
		html.classList.remove("dark");
	}
}

/** Restore the app theme after leaving the splash route. */
export function restoreAppDocumentTheme(
	globalTheme: SplashPageTheme,
	root?: ThemeClassRoot,
): void {
	applySplashDocumentTheme(globalTheme, root);
}
