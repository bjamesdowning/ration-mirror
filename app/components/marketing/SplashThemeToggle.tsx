import { MoonIcon, SunIcon } from "~/components/icons/PageIcons";

export type SplashPageTheme = "light" | "dark";

type SplashThemeToggleProps = {
	theme: SplashPageTheme;
	onChange: (theme: SplashPageTheme) => void;
	/** Compact control for the sticky public header */
	variant?: "header" | "menu";
};

export function SplashThemeToggle({
	theme,
	onChange,
	variant = "header",
}: SplashThemeToggleProps) {
	const isMenu = variant === "menu";
	const segmentSize = isMenu ? "w-9 h-9" : "w-8 h-8";
	const inactiveSegment = "bg-transparent text-muted hover:bg-carbon/5";

	return (
		<fieldset
			className={
				isMenu
					? "flex items-center rounded-lg overflow-hidden border border-carbon/10 shrink-0 m-0 p-0"
					: "flex items-center rounded-md overflow-hidden shrink-0 m-0 p-0 border-0 bg-carbon/5"
			}
		>
			<legend className="sr-only">Splash page appearance</legend>
			<button
				type="button"
				onClick={() => onChange("light")}
				aria-pressed={theme === "light"}
				aria-label="Light mode"
				className={`flex items-center justify-center ${segmentSize} transition-colors ${
					theme === "light"
						? "bg-hyper-green/90 text-on-hyper-green"
						: inactiveSegment
				}`}
			>
				<SunIcon className="w-4 h-4" />
			</button>
			<button
				type="button"
				onClick={() => onChange("dark")}
				aria-pressed={theme === "dark"}
				aria-label="Dark mode"
				className={`flex items-center justify-center ${segmentSize} transition-colors ${
					theme === "dark"
						? "bg-hyper-green/90 text-on-hyper-green"
						: inactiveSegment
				}`}
			>
				<MoonIcon className="w-4 h-4" />
			</button>
		</fieldset>
	);
}
