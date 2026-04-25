import { Link } from "react-router";
import { PublicHeader } from "~/components/shell/PublicHeader";

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

					<section className="glass-panel rounded-2xl p-6 space-y-4">
						<h2 className="text-display text-2xl text-carbon">REST API</h2>
						<p className="text-sm text-muted leading-relaxed">
							Send an organization-scoped API key with <code>X-Api-Key</code> or{" "}
							<code>Authorization: Bearer &lt;key&gt;</code>.
						</p>
						<ul className="grid gap-3 text-sm text-muted">
							<li>
								<code>GET /api/v1/inventory/export</code> — export Cargo as CSV.
							</li>
							<li>
								<code>POST /api/v1/inventory/import</code> — import Cargo from
								CSV.
							</li>
							<li>
								<code>GET /api/v1/galley/export</code> — export Galley as JSON.
							</li>
							<li>
								<code>POST /api/v1/galley/import</code> — import Galley from
								JSON.
							</li>
							<li>
								<code>GET /api/v1/supply/export</code> — export active Supply
								CSV.
							</li>
						</ul>
					</section>

					<section
						id="mcp-server"
						className="glass-panel rounded-2xl p-6 space-y-4"
					>
						<h2 className="text-display text-2xl text-carbon">MCP Server</h2>
						<p className="text-sm text-muted leading-relaxed">
							Connect an MCP-compatible AI client to{" "}
							<code>https://mcp.ration.mayutic.com/mcp</code> using a Ration API
							key with the <code>mcp</code> scope.
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
