import { useFetcher, useRouteLoaderData } from "react-router";
import { MoonIcon, SunIcon } from "~/components/icons/PageIcons";

type ThemeToggleProps = {
	/** Lower-contrast segments sized for the hub header toolbar */
	variant?: "default" | "toolbar";
};

export function ThemeToggle({ variant = "default" }: ThemeToggleProps) {
	const rootData = useRouteLoaderData("root") as
		| { theme?: "light" | "dark" }
		| undefined;
	const theme = rootData?.theme ?? "dark";
	const fetcher = useFetcher();

	const isToolbar = variant === "toolbar";

	const handleToggle = (nextTheme: "light" | "dark") => {
		if (nextTheme === theme) return;
		if (nextTheme === "dark") {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
		fetcher.submit(
			{ intent: "update-theme", theme: nextTheme },
			{ method: "post", action: "/hub/settings" },
		);
	};

	const segmentSize = isToolbar ? "w-8 h-8" : "w-9 h-9";
	const inactiveSegment = isToolbar
		? "bg-transparent text-muted hover:bg-platinum/60 dark:hover:bg-white/10"
		: "bg-platinum/50 dark:bg-white/5 text-muted hover:bg-platinum dark:hover:bg-white/10";

	return (
		<fieldset
			className={
				isToolbar
					? "flex items-center rounded-md overflow-hidden shrink-0 m-0 p-0 border-0 bg-platinum/50 dark:bg-white/[0.08]"
					: "flex items-center rounded-lg overflow-hidden border border-platinum dark:border-white/10 shrink-0 m-0 p-0"
			}
		>
			<legend className="sr-only">Theme</legend>
			<button
				type="button"
				onClick={() => handleToggle("light")}
				aria-pressed={theme === "light"}
				aria-label="Light mode"
				className={`flex items-center justify-center ${segmentSize} transition-colors ${
					theme === "light" ? "bg-hyper-green/90 text-carbon" : inactiveSegment
				}`}
			>
				<SunIcon className="w-4 h-4" />
			</button>
			<button
				type="button"
				onClick={() => handleToggle("dark")}
				aria-pressed={theme === "dark"}
				aria-label="Dark mode"
				className={`flex items-center justify-center ${segmentSize} transition-colors ${
					theme === "dark" ? "bg-hyper-green/90 text-carbon" : inactiveSegment
				}`}
			>
				<MoonIcon className="w-4 h-4" />
			</button>
		</fieldset>
	);
}
