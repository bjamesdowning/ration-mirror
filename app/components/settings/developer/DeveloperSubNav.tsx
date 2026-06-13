import type { DeveloperSubTab } from "./types";

const SUB_TABS: { id: DeveloperSubTab; label: string }[] = [
	{ id: "overview", label: "Overview" },
	{ id: "mcp", label: "MCP" },
	{ id: "api-keys", label: "API Keys" },
];

type DeveloperSubNavProps = {
	activeTab: DeveloperSubTab;
	onTabChange: (tab: DeveloperSubTab) => void;
};

export function DeveloperSubNav({
	activeTab,
	onTabChange,
}: DeveloperSubNavProps) {
	return (
		<fieldset className="flex items-center gap-1 overflow-x-auto rounded-lg border border-platinum dark:border-white/10 p-1 m-0">
			<legend className="sr-only">Developer sections</legend>
			{SUB_TABS.map((tab) => {
				const active = activeTab === tab.id;
				return (
					<button
						key={tab.id}
						type="button"
						onClick={() => onTabChange(tab.id)}
						aria-pressed={active}
						className={`shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
							active
								? "bg-hyper-green/90 text-carbon"
								: "bg-transparent text-muted hover:bg-platinum/60 dark:hover:bg-white/10"
						}`}
					>
						{tab.label}
					</button>
				);
			})}
		</fieldset>
	);
}
