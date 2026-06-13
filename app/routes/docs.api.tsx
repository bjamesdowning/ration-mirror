import { Link } from "react-router";
import { PublicHeader } from "~/components/shell/PublicHeader";
import { MCP_TOOL_GROUPS } from "~/lib/agent-readiness";
import {
	API_RATE_LIMITS,
	formatInventoryExportCurl,
	V1_ENDPOINTS,
} from "~/lib/api-docs";
import {
	MCP_API_KEY_CONFIG_SNIPPET,
	MCP_CONNECT_STEPS,
	MCP_ENDPOINT_URL,
	MCP_OAUTH_TROUBLESHOOTING,
	MCP_SUPPORTED_CLIENTS,
} from "~/lib/mcp/connect-copy";

export default function ApiDocs() {
	return (
		<div className="min-h-screen bg-ceramic text-carbon">
			<PublicHeader breadcrumb="API" breadcrumbHref="/docs/api" />
			<main className="max-w-4xl mx-auto px-6 py-12">
				<div className="space-y-10">
					<header className="space-y-4">
						<p className="text-label text-hyper-green">Agent Documentation</p>
						<h1 className="text-display text-4xl text-carbon">
							Ration API and MCP Discovery
						</h1>
						<p className="text-muted leading-relaxed max-w-2xl">
							Ration exposes kitchen data to agents through a scoped REST API
							and a dedicated MCP server for conversational kitchen operations.
						</p>
					</header>

					<section id="rest" className="glass-panel rounded-2xl p-6 space-y-4">
						<h2 className="text-display text-2xl text-carbon">REST API</h2>
						<p className="text-sm text-muted leading-relaxed">
							Send an organization-scoped API key with <code>X-Api-Key</code> or{" "}
							<code>Authorization: Bearer &lt;key&gt;</code>. Create keys in{" "}
							<Link
								to="/hub/settings#api"
								className="text-hyper-green hover:underline"
							>
								Hub → Settings → Developer → API Keys
							</Link>
							.
						</p>
						<div>
							<h3 className="font-semibold text-carbon mb-2">Base URL</h3>
							<p className="text-sm text-muted">
								<code>/api/v1</code> on your Ration app origin (e.g.{" "}
								<code>https://ration.mayutic.com/api/v1</code>).
							</p>
						</div>
						<div>
							<h3 className="font-semibold text-carbon mb-2">Rate limits</h3>
							<p className="text-sm text-muted">
								Exports: {API_RATE_LIMITS.export}. Imports:{" "}
								{API_RATE_LIMITS.import}.
							</p>
						</div>
						<div>
							<h3 className="font-semibold text-carbon mb-2">Endpoints</h3>
							<div className="overflow-x-auto rounded-lg border border-platinum">
								<table className="w-full text-left text-sm">
									<thead>
										<tr className="bg-platinum/50">
											<th className="px-3 py-2 font-semibold text-carbon">
												Endpoint
											</th>
											<th className="px-3 py-2 font-semibold text-carbon">
												Method
											</th>
											<th className="px-3 py-2 font-semibold text-carbon">
												Scope
											</th>
											<th className="px-3 py-2 font-semibold text-carbon">
												Format
											</th>
										</tr>
									</thead>
									<tbody>
										{V1_ENDPOINTS.map((ep) => (
											<tr key={ep.path} className="border-t border-platinum/50">
												<td className="px-3 py-2 font-mono text-carbon">
													{ep.path}
												</td>
												<td className="px-3 py-2 text-muted">{ep.method}</td>
												<td className="px-3 py-2 text-muted">{ep.scope}</td>
												<td className="px-3 py-2 text-muted">{ep.format}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
						<div>
							<h3 className="font-semibold text-carbon mb-2">
								Example: Export inventory
							</h3>
							<pre className="text-xs bg-carbon text-platinum p-3 rounded-lg overflow-x-auto font-mono">
								{formatInventoryExportCurl("https://ration.mayutic.com")}
							</pre>
						</div>
					</section>

					<section id="mcp" className="glass-panel rounded-2xl p-6 space-y-4">
						<h2 className="text-display text-2xl text-carbon">MCP Server</h2>
						<p className="text-sm text-muted leading-relaxed">
							Connect an MCP-compatible AI client to{" "}
							<code>{MCP_ENDPOINT_URL}</code>. Ration is AI-agent-ready: paste
							the URL, complete browser sign-in, select your household, and
							approve granular permissions — no manual API key for standard
							clients.
						</p>
						<div>
							<h3 className="font-semibold text-carbon mb-2">
								Recommended: OAuth 2.1
							</h3>
							<ol className="list-decimal list-inside space-y-2 text-sm text-muted">
								{MCP_CONNECT_STEPS.map((step) => (
									<li key={step}>{step}</li>
								))}
							</ol>
						</div>
						<div>
							<h3 className="font-semibold text-carbon mb-2">
								Supported clients
							</h3>
							<p className="text-sm text-muted">
								{MCP_SUPPORTED_CLIENTS.join(", ")}.
							</p>
						</div>
						<p className="text-sm text-muted leading-relaxed">
							Manage grants in{" "}
							<Link
								to="/hub/settings#connected-agents"
								className="text-hyper-green hover:underline"
							>
								Hub → Settings → Developer → MCP
							</Link>
							. Discovery:{" "}
							<Link
								to="/.well-known/oauth-protected-resource"
								className="text-hyper-green"
							>
								MCP protected resource metadata
							</Link>
							,{" "}
							<Link
								to="/.well-known/oauth-authorization-server"
								className="text-hyper-green"
							>
								OAuth authorization server
							</Link>
							,{" "}
							<Link
								to="/.well-known/mcp/server-card.json"
								className="text-hyper-green"
							>
								MCP server card
							</Link>
							.
						</p>
					</section>

					<section
						id="mcp-troubleshooting"
						className="glass-panel rounded-2xl p-6 space-y-4"
					>
						<h2 className="text-display text-2xl text-carbon">
							MCP OAuth troubleshooting
						</h2>
						<ul className="space-y-4 text-sm text-muted">
							{MCP_OAUTH_TROUBLESHOOTING.map((row) => (
								<li key={row.symptom}>
									<p className="font-semibold text-carbon">{row.symptom}</p>
									<p className="mt-1 leading-relaxed">{row.fix}</p>
								</li>
							))}
						</ul>
						<p className="text-xs text-muted">
							Flows are short-lived (~10 minutes). Restart from your AI client
							if authorization expired — do not reuse an old browser tab.
						</p>
					</section>

					<section
						id="mcp-advanced"
						className="glass-panel rounded-2xl p-6 space-y-4"
					>
						<h2 className="text-display text-2xl text-carbon">
							Advanced: manual MCP auth
						</h2>
						<p className="text-sm text-muted leading-relaxed">
							Organization API keys with <code>mcp:*</code> scopes remain
							supported for CI, custom headers, and legacy clients. Create keys
							in{" "}
							<Link
								to="/hub/settings#api"
								className="text-hyper-green hover:underline"
							>
								Hub → Settings → Developer → API Keys
							</Link>
							, then pass the key as a Bearer token via{" "}
							<code className="font-mono text-xs">mcp-remote</code>.
						</p>
						<pre className="text-xs bg-carbon text-platinum p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">
							{MCP_API_KEY_CONFIG_SNIPPET}
						</pre>
						<p className="text-xs text-muted">
							Replace <code>&lt;your-mcp-scoped-key&gt;</code> with your key.{" "}
							<code>RATION_AUTH_HEADER</code> must include the{" "}
							<code>Bearer </code> prefix.
						</p>
					</section>

					<section
						id="mcp-tools"
						className="glass-panel rounded-2xl p-6 space-y-4"
					>
						<h2 className="text-display text-2xl text-carbon">MCP tools</h2>
						<p className="text-sm text-muted leading-relaxed">
							Tools are grouped by domain. Scope requirements and parameters are
							defined in the{" "}
							<Link
								to="/.well-known/mcp/server-card.json"
								className="text-hyper-green hover:underline"
							>
								MCP server card
							</Link>
							. MCP calls do not consume AI credits; rate limits apply instead.
						</p>
						<div className="space-y-4">
							{MCP_TOOL_GROUPS.map((group) => (
								<div key={group.name}>
									<h3 className="font-semibold text-carbon mb-2">
										{group.name}
									</h3>
									<p className="text-sm font-mono text-muted leading-relaxed">
										{group.tools.join(", ")}
									</p>
								</div>
							))}
						</div>
						<p className="text-xs text-muted">
							Rate limits: read tools{" "}
							<code className="font-mono">mcp_list</code> (30/min), search{" "}
							<code className="font-mono">mcp_search</code> (20/min), write{" "}
							<code className="font-mono">mcp_write</code> (15/min), supply sync{" "}
							<code className="font-mono">mcp_supply_sync</code> (8/min).
						</p>
					</section>

					<section className="glass-panel rounded-2xl p-6 space-y-4">
						<h2 className="text-display text-2xl text-carbon">Discovery</h2>
						<div className="grid gap-2 text-sm">
							<Link to="/.well-known/api-catalog" className="text-hyper-green">
								/.well-known/api-catalog
							</Link>
							<Link to="/api/openapi.json" className="text-hyper-green">
								/api/openapi.json
							</Link>
							<Link
								to="/.well-known/oauth-protected-resource"
								className="text-hyper-green"
							>
								/.well-known/oauth-protected-resource
							</Link>
							<Link
								to="/.well-known/mcp/server-card.json"
								className="text-hyper-green"
							>
								/.well-known/mcp/server-card.json
							</Link>
							<Link
								to="/.well-known/agent-skills/index.json"
								className="text-hyper-green"
							>
								/.well-known/agent-skills/index.json
							</Link>
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
