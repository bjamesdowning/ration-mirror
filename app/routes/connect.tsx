import { Link } from "react-router";
import { CopyField } from "~/components/settings/developer/CopyField";
import {
	MCP_ENDPOINT_URL,
	MCP_SETUP_STEPS_SHORT,
	MCP_SUPPORTED_CLIENTS,
} from "~/lib/mcp/connect-copy";
import { MCP_DEEP_LINK_CLIENTS } from "~/lib/mcp/deep-links";

export default function ConnectPage() {
	return (
		<div className="min-h-screen bg-ceramic">
			<div className="max-w-2xl mx-auto px-6 py-16">
				<h1 className="font-mono text-3xl font-bold text-carbon mb-2">
					Connect your AI agent
				</h1>
				<p className="text-muted mb-8">
					Add Ration to Cursor, Claude, ChatGPT, or any MCP-compatible client.
				</p>

				<section className="glass-panel rounded-2xl p-8 mb-6">
					<h2 className="text-xs text-label text-muted mb-4">
						One-click install
					</h2>
					<div className="flex flex-wrap gap-3">
						{MCP_DEEP_LINK_CLIENTS.map((client) => (
							<a
								key={client.id}
								href={client.build()}
								className="inline-flex items-center px-4 py-2.5 rounded-xl bg-hyper-green text-carbon font-mono text-sm font-bold hover:opacity-90 transition-opacity"
							>
								Add to {client.label}
							</a>
						))}
					</div>
					<p className="text-xs text-muted mt-4">
						Deep links open your client&apos;s MCP installer. Complete OAuth
						sign-in when prompted.
					</p>
				</section>

				<section className="glass-panel rounded-2xl p-8 mb-6">
					<h2 className="text-xs text-label text-muted mb-4">Manual setup</h2>
					<CopyField
						value={MCP_ENDPOINT_URL}
						label="MCP server URL"
						copyLabel="Copy URL"
						toastDescription="MCP URL copied"
					/>
					<ol className="mt-6 space-y-3">
						{MCP_SETUP_STEPS_SHORT.map((step, i) => (
							<li key={step} className="flex gap-3 text-sm text-carbon">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-hyper-green/20 text-hyper-green text-xs font-bold flex items-center justify-center">
									{i + 1}
								</span>
								{step}
							</li>
						))}
					</ol>
					<p className="text-xs text-muted mt-4">
						Supported: {MCP_SUPPORTED_CLIENTS.join(", ")}.
					</p>
				</section>

				<section className="glass-panel rounded-2xl p-8 mb-6">
					<h2 className="text-xs text-label text-muted mb-2">
						Agent-first onboarding
					</h2>
					<p className="text-sm text-muted mb-4">
						Agents can self-register without human signup, then a human claims
						the kitchen via email OTP.
					</p>
					<div className="flex flex-wrap gap-3">
						<Link
							to="/mcp.md"
							className="text-sm font-mono text-hyper-green hover:underline"
						>
							Read mcp.md →
						</Link>
						<Link
							to="/auth.md"
							className="text-sm font-mono text-hyper-green hover:underline"
						>
							Read auth.md →
						</Link>
						<Link
							to="/connect/claim"
							className="text-sm font-mono text-hyper-green hover:underline"
						>
							Claim an agent kitchen →
						</Link>
					</div>
				</section>

				<p className="text-center text-sm text-muted">
					<Link to="/" className="text-hyper-green hover:underline">
						← Back to Ration
					</Link>
				</p>
			</div>
		</div>
	);
}
