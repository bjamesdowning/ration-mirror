import { useCallback, useEffect, useState } from "react";
import { ApiKeysPanel } from "./ApiKeysPanel";
import { ConnectedAgentsPanel } from "./ConnectedAgentsPanel";
import { DeveloperOverview } from "./DeveloperOverview";
import { DeveloperSubNav } from "./DeveloperSubNav";
import type { DeveloperSectionProps, DeveloperSubTab } from "./types";

const HASH_TO_SUB_TAB: Record<string, DeveloperSubTab> = {
	developer: "overview",
	"connected-agents": "mcp",
	api: "api-keys",
};

const SUB_TAB_TO_HASH: Record<DeveloperSubTab, string> = {
	overview: "developer",
	mcp: "connected-agents",
	"api-keys": "api",
};

function getSubTabFromHash(): DeveloperSubTab {
	if (typeof window === "undefined") return "overview";
	const hash = window.location.hash.replace("#", "");
	return HASH_TO_SUB_TAB[hash] ?? "overview";
}

function SectionHeading({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="text-xs text-label text-muted tracking-widest uppercase px-1">
			{children}
		</h2>
	);
}

export function DeveloperSection({
	apiKeys,
	connectedAgents,
	agentKitchens,
	organizationName,
	origin,
}: DeveloperSectionProps) {
	const [activeTab, setActiveTab] = useState<DeveloperSubTab>("overview");

	const syncHash = useCallback((tab: DeveloperSubTab) => {
		const nextHash = SUB_TAB_TO_HASH[tab];
		if (window.location.hash.replace("#", "") !== nextHash) {
			window.history.replaceState(null, "", `#${nextHash}`);
		}
	}, []);

	const handleTabChange = useCallback(
		(tab: DeveloperSubTab) => {
			setActiveTab(tab);
			syncHash(tab);
		},
		[syncHash],
	);

	useEffect(() => {
		setActiveTab(getSubTabFromHash());
	}, []);

	useEffect(() => {
		const onHashChange = () => {
			setActiveTab(getSubTabFromHash());
		};
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	return (
		<div className="space-y-4">
			<SectionHeading>Developer</SectionHeading>
			<DeveloperSubNav activeTab={activeTab} onTabChange={handleTabChange} />

			{activeTab === "overview" && (
				<DeveloperOverview
					grantCount={connectedAgents.length}
					apiKeyCount={apiKeys.length}
					onNavigate={handleTabChange}
				/>
			)}
			{activeTab === "mcp" && (
				<ConnectedAgentsPanel
					grants={connectedAgents}
					agentKitchens={agentKitchens}
					apiKeys={apiKeys}
				/>
			)}
			{activeTab === "api-keys" && (
				<ApiKeysPanel
					apiKeys={apiKeys}
					organizationName={organizationName}
					origin={origin}
					onNavigate={handleTabChange}
				/>
			)}
		</div>
	);
}
