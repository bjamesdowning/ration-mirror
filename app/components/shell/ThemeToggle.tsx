import { useFetcher, useRouteLoaderData } from "react-router";
import { MoonIcon, SunIcon } from "~/components/icons/PageIcons";

export function ThemeToggle() {
	const rootData = useRouteLoaderData("root") as
		| { theme?: "light" | "dark" }
		| undefined;
	const theme = rootData?.theme ?? "dark";
	const fetcher = useFetcher();

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

	return (
		<fieldset className="flex items-center rounded-lg overflow-hidden border border-platinum dark:border-white/10 shrink-0 m-0 p-0">
			<legend className="sr-only">Theme</legend>
			<button
				type="button"
				onClick={() => handleToggle("light")}
				aria-pressed={theme === "light"}
				aria-label="Light mode"
				className={`flex items-center justify-center w-9 h-9 transition-colors ${
					theme === "light"
						? "bg-hyper-green text-carbon"
						: "bg-platinum/50 dark:bg-white/5 text-muted hover:bg-platinum dark:hover:bg-white/10"
				}`}
			>
				<SunIcon className="w-4 h-4" />
			</button>
			<button
				type="button"
				onClick={() => handleToggle("dark")}
				aria-pressed={theme === "dark"}
				aria-label="Dark mode"
				className={`flex items-center justify-center w-9 h-9 transition-colors ${
					theme === "dark"
						? "bg-hyper-green text-carbon"
						: "bg-platinum/50 dark:bg-white/5 text-muted hover:bg-platinum dark:hover:bg-white/10"
				}`}
			>
				<MoonIcon className="w-4 h-4" />
			</button>
		</fieldset>
	);
}
