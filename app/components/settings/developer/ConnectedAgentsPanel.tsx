import { Link, useFetcher } from "react-router";
import {
	MCP_ENDPOINT_URL,
	MCP_OAUTH_TROUBLESHOOTING,
	MCP_SETUP_STEPS_SHORT,
	MCP_SUPPORTED_CLIENTS,
} from "~/lib/mcp/connect-copy";
import type { ConnectedAgentGrant } from "~/lib/oauth.server";
import { formatOAuthScopesDisplay } from "~/lib/oauth-scopes";
import { CopyField } from "./CopyField";
import type { AgentKitchenRow, ApiKeyRow } from "./types";

type ConnectedAgentsPanelProps = {
	grants: ConnectedAgentGrant[];
	agentKitchens: AgentKitchenRow[];
	apiKeys: ApiKeyRow[];
};

function formatLastUsed(at: Date | null): string {
	if (!at) return "Never";
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(at);
}

export function ConnectedAgentsPanel({
	grants,
	agentKitchens,
	apiKeys,
}: ConnectedAgentsPanelProps) {
	const revokeFetcher = useFetcher();
	const RevokeGrantForm = revokeFetcher.Form;

	return (
		<div id="connected-agents" className="space-y-4">
			<section className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-1">Connect</h3>
				<p className="text-sm text-muted mb-4">
					Add the MCP server URL in your AI client, then complete browser
					sign-in.
				</p>

				<ol className="grid gap-3 sm:grid-cols-3 mb-6">
					{MCP_SETUP_STEPS_SHORT.map((step, index) => (
						<li
							key={step}
							className="rounded-lg border border-platinum bg-platinum/20 p-3"
						>
							<span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-hyper-green/20 text-hyper-green text-xs font-bold mb-2">
								{index + 1}
							</span>
							<p className="text-sm text-carbon">{step}</p>
						</li>
					))}
				</ol>

				<CopyField
					value={MCP_ENDPOINT_URL}
					label="MCP server URL"
					copyLabel="Copy URL"
					toastDescription="MCP URL copied to clipboard"
				/>

				<p className="text-xs text-muted mt-4">
					Supported: {MCP_SUPPORTED_CLIENTS.join(", ")}.
				</p>
				<p className="text-xs text-muted mt-2">
					<Link to="/connect" className="text-hyper-green hover:underline">
						One-click install for Cursor, Claude, and ChatGPT →
					</Link>
				</p>
			</section>

			{agentKitchens.length > 0 ? (
				<section className="glass-panel rounded-xl p-6">
					<h3 className="text-xs text-label text-muted mb-1">
						Agent-registered kitchens
					</h3>
					<p className="text-sm text-muted mb-3">
						Self-registered agent kitchens linked to this household.
					</p>
					<ul className="space-y-3">
						{agentKitchens.map((kitchen) => {
							const key = apiKeys.find((k) => k.id === kitchen.apiKeyId);
							return (
								<li
									key={kitchen.id}
									className="rounded-lg border border-platinum p-4"
								>
									<p className="font-medium text-carbon">
										{kitchen.clientHint ?? "Agent kitchen"}
									</p>
									<p className="text-xs text-muted mt-1">
										Status:{" "}
										{kitchen.status === "claimed"
											? "Claimed"
											: "Pending claim (read-only)"}
									</p>
									<p className="text-xs text-muted mt-1">
										Last API use: {formatLastUsed(key?.lastUsedAt ?? null)}
									</p>
									{kitchen.claimedAt ? (
										<p className="text-xs text-muted mt-1">
											Claimed: {formatLastUsed(kitchen.claimedAt)}
										</p>
									) : null}
								</li>
							);
						})}
					</ul>
				</section>
			) : null}

			<section className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-1">Active grants</h3>
				<p className="text-sm text-muted mb-3">
					AI clients you authorized via OAuth. Revoking a grant takes effect
					immediately and does not affect API keys.
				</p>
				{grants.length === 0 ? (
					<p className="text-sm text-muted">
						No connected agents yet. Add the MCP URL above in your AI client to
						get started.
					</p>
				) : (
					<ul className="space-y-3">
						{grants.map((grant) => (
							<li
								key={grant.consentId}
								className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-platinum p-4"
							>
								<div>
									<p className="font-medium text-carbon">
										{grant.clientName ?? grant.clientId}
									</p>
									<p className="text-xs text-muted mt-1">
										Household:{" "}
										{grant.organizationId
											? (grant.organizationName ?? "—")
											: "Not linked — revoke and reconnect"}
									</p>
									<p className="text-xs text-muted mt-1">
										Scopes: {formatOAuthScopesDisplay(grant.scopes)}
									</p>
								</div>
								<RevokeGrantForm method="post" action="/api/oauth/grants">
									<input type="hidden" name="intent" value="revoke" />
									<input
										type="hidden"
										name="consentId"
										value={grant.consentId}
									/>
									<button
										type="submit"
										className="px-3 py-1.5 text-xs font-semibold rounded border border-carbon/20 text-carbon hover:bg-platinum/50"
										disabled={revokeFetcher.state !== "idle"}
									>
										Revoke
									</button>
								</RevokeGrantForm>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="glass-panel rounded-xl p-6">
				<details className="rounded-lg border border-platinum bg-platinum/20 p-4">
					<summary className="cursor-pointer text-sm font-medium text-carbon">
						OAuth troubleshooting
					</summary>
					<ul className="mt-3 space-y-3 text-sm text-carbon/80">
						{MCP_OAUTH_TROUBLESHOOTING.map((row) => (
							<li key={row.symptom}>
								<p className="font-medium text-carbon">{row.symptom}</p>
								<p className="mt-1">{row.fix}</p>
							</li>
						))}
					</ul>
					<p className="mt-3 text-xs text-muted">
						Flows are short-lived (~10 minutes). If authorization expired,
						restart from your AI client — do not reuse an old browser tab.
					</p>
				</details>
				<p className="text-sm text-muted mt-4">
					<Link
						to="/docs/api#mcp-tools"
						className="text-hyper-green font-medium hover:underline"
					>
						View all MCP tools & advanced auth →
					</Link>
				</p>
			</section>
		</div>
	);
}
