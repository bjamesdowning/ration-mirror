import { Link } from "react-router";
import {
	DEVELOPER_OVERVIEW_PATHS,
	MCP_AGENT_READY_TAGLINE,
	MCP_ENDPOINT_URL,
} from "~/lib/mcp/connect-copy";
import { CopyField } from "./CopyField";
import type { DeveloperSubTab } from "./types";

type DeveloperOverviewProps = {
	grantCount: number;
	apiKeyCount: number;
	onNavigate: (tab: DeveloperSubTab) => void;
};

export function DeveloperOverview({
	grantCount,
	apiKeyCount,
	onNavigate,
}: DeveloperOverviewProps) {
	const mcpPath = DEVELOPER_OVERVIEW_PATHS.mcp;
	const restPath = DEVELOPER_OVERVIEW_PATHS.rest;

	return (
		<div className="space-y-4">
			<div className="glass-panel rounded-xl p-6">
				<p className="text-sm text-muted">{MCP_AGENT_READY_TAGLINE}</p>
				<p className="text-xs text-muted mt-3">
					{grantCount} connected agent{grantCount === 1 ? "" : "s"} ·{" "}
					{apiKeyCount} API key{apiKeyCount === 1 ? "" : "s"}
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<PathCard
					title={mcpPath.title}
					description={mcpPath.description}
					bullets={mcpPath.bullets}
					cta={mcpPath.cta}
					onAction={() => onNavigate("mcp")}
				/>
				<PathCard
					title={restPath.title}
					description={restPath.description}
					bullets={restPath.bullets}
					cta={restPath.cta}
					onAction={() => onNavigate("api-keys")}
				/>
			</div>

			<div className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-1">Quick connect</h3>
				<p className="text-sm text-muted mb-4">
					Copy the MCP server URL, then open the MCP tab for setup steps.
				</p>
				<CopyField
					value={MCP_ENDPOINT_URL}
					label="MCP server URL"
					copyLabel="Copy URL"
					toastDescription="MCP URL copied to clipboard"
				/>
				<button
					type="button"
					onClick={() => onNavigate("mcp")}
					className="mt-4 text-sm font-medium text-hyper-green hover:underline"
				>
					Continue to MCP setup →
				</button>
			</div>

			<div className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-1">Documentation</h3>
				<p className="text-sm text-muted mb-3">
					Full API reference, MCP tools, troubleshooting, and discovery links.
				</p>
				<div className="flex flex-wrap gap-3">
					<Link
						to="/docs/api"
						className="inline-flex items-center gap-2 px-4 py-2 bg-hyper-green text-carbon rounded-lg font-semibold text-sm hover:bg-hyper-green/90 transition-colors"
					>
						Full API & MCP documentation
					</Link>
					<Link
						to="/blog/mcp-kitchen-assistant"
						className="inline-flex items-center gap-2 px-4 py-2 bg-hyper-green/10 text-hyper-green rounded-lg font-medium text-sm hover:bg-hyper-green/20 transition-colors"
					>
						MCP setup guide
					</Link>
				</div>
			</div>
		</div>
	);
}

function PathCard({
	title,
	description,
	bullets,
	cta,
	onAction,
}: {
	title: string;
	description: string;
	bullets: readonly string[];
	cta: string;
	onAction: () => void;
}) {
	return (
		<div className="glass-panel rounded-xl p-6 flex flex-col">
			<h3 className="text-sm font-semibold text-carbon mb-1">{title}</h3>
			<p className="text-sm text-muted mb-4">{description}</p>
			<ul className="space-y-2 text-sm text-carbon/80 mb-6 flex-1">
				{bullets.map((bullet) => (
					<li key={bullet} className="flex gap-2">
						<span className="text-hyper-green shrink-0" aria-hidden>
							•
						</span>
						<span>{bullet}</span>
					</li>
				))}
			</ul>
			<button
				type="button"
				onClick={onAction}
				className="w-fit px-4 py-2 bg-hyper-green/10 text-hyper-green rounded-lg font-medium text-sm hover:bg-hyper-green/20 transition-colors"
			>
				{cta}
			</button>
		</div>
	);
}
