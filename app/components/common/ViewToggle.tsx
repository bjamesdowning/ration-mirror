import { useFetcher } from "react-router";

type ViewMode = "card" | "list";
type ViewPage = "cargo" | "galley";

interface ViewToggleProps {
	page: ViewPage;
	currentMode: ViewMode;
	onToggle: (mode: ViewMode) => void;
}

export function ViewToggle({ page, currentMode, onToggle }: ViewToggleProps) {
	const fetcher = useFetcher();

	const handleToggle = (mode: ViewMode) => {
		if (mode === currentMode) return;
		onToggle(mode);
		fetcher.submit(
			{ intent: "update-view-mode", page, mode },
			{ method: "post", action: "/hub/settings" },
		);
	};

	return (
		<fieldset className="flex items-center rounded-lg overflow-hidden border border-platinum dark:border-white/10 shrink-0 m-0 p-0">
			<legend className="sr-only">View mode</legend>
			<button
				type="button"
				onClick={() => handleToggle("card")}
				aria-pressed={currentMode === "card"}
				aria-label="Card view"
				className={`flex items-center justify-center w-8 h-8 transition-colors ${
					currentMode === "card"
						? "bg-hyper-green text-carbon"
						: "bg-platinum/50 dark:bg-white/5 text-muted hover:bg-platinum dark:hover:bg-white/10"
				}`}
			>
				<GridIcon />
			</button>
			<button
				type="button"
				onClick={() => handleToggle("list")}
				aria-pressed={currentMode === "list"}
				aria-label="List view"
				className={`flex items-center justify-center w-8 h-8 transition-colors ${
					currentMode === "list"
						? "bg-hyper-green text-carbon"
						: "bg-platinum/50 dark:bg-white/5 text-muted hover:bg-platinum dark:hover:bg-white/10"
				}`}
			>
				<ListIcon />
			</button>
		</fieldset>
	);
}

function GridIcon() {
	return (
		<svg
			className="w-4 h-4"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
			/>
		</svg>
	);
}

function ListIcon() {
	return (
		<svg
			className="w-4 h-4"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M4 6h16M4 12h16M4 18h16"
			/>
		</svg>
	);
}
