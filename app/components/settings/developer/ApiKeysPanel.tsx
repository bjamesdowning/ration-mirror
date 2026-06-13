import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import { Toast } from "~/components/shell/Toast";
import { useToast } from "~/hooks/useToast";
import { REST_QUICK_REF } from "~/lib/api-docs";
import type { ApiScope } from "~/lib/schemas/api-keys";
import { ApiKeyRowItem } from "./ApiKeyRowItem";
import { ScopePresetPicker } from "./ScopePresetPicker";
import { DEFAULT_SCOPES } from "./scope-meta";
import type { ApiKeyRow, DeveloperSubTab } from "./types";

type ApiKeysPanelProps = {
	apiKeys: ApiKeyRow[];
	organizationName: string;
	origin: string;
	onNavigate: (tab: DeveloperSubTab) => void;
};

export function ApiKeysPanel({
	apiKeys,
	organizationName,
	origin,
	onNavigate,
}: ApiKeysPanelProps) {
	const copyToast = useToast({ duration: 3000 });
	const createFetcher = useFetcher<{
		key?: string;
		prefix?: string;
		id?: string;
		name?: string;
		scopes?: string;
		createdAt?: string;
		error?: string;
	}>();
	const CreateKeyForm = createFetcher.Form;
	const [newKeyDisplay, setNewKeyDisplay] = useState<string | null>(null);
	const [createName, setCreateName] = useState("");
	const [selectedScopes, setSelectedScopes] =
		useState<ApiScope[]>(DEFAULT_SCOPES);

	useEffect(() => {
		if (createFetcher.data?.key && createFetcher.state === "idle") {
			setNewKeyDisplay(createFetcher.data.key);
			setCreateName("");
			setSelectedScopes(DEFAULT_SCOPES);
		}
	}, [createFetcher.data?.key, createFetcher.state]);

	const canSubmit =
		createFetcher.state === "idle" &&
		createName.trim().length > 0 &&
		selectedScopes.length > 0;

	const handleCreate = (e: React.FormEvent) => {
		if (!canSubmit) e.preventDefault();
		else setNewKeyDisplay(null);
	};

	const baseUrl = `${origin || "https://yoursite.com"}/api/v1`;

	return (
		<div id="api" className="space-y-4">
			<section className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-1">API Keys</h3>
				<p className="text-sm text-muted mb-4">
					Organization-scoped keys for the{" "}
					<span className="font-medium text-carbon">REST v1 API</span> and{" "}
					<span className="font-medium text-carbon">advanced MCP</span> for{" "}
					<span className="font-medium text-carbon">{organizationName}</span>.
					For standard AI clients, use{" "}
					<button
						type="button"
						onClick={() => onNavigate("mcp")}
						className="text-hyper-green font-medium hover:underline"
					>
						OAuth MCP
					</button>{" "}
					instead.
				</p>

				{newKeyDisplay && (
					<div className="mb-6 p-4 bg-hyper-green/10 border border-hyper-green/20 rounded-lg">
						<p className="text-xs text-muted font-bold uppercase mb-2">
							Copy your key now — it won&apos;t be shown again
						</p>
						<div className="flex gap-2 flex-wrap">
							<input
								type="text"
								readOnly
								value={newKeyDisplay}
								className="flex-1 min-w-[200px] bg-white/50 border border-carbon/10 rounded px-3 py-1 text-sm font-mono text-carbon"
								onClick={(e) => e.currentTarget.select()}
							/>
							<button
								type="button"
								onClick={() => {
									navigator.clipboard.writeText(newKeyDisplay);
									copyToast.show();
								}}
								className="px-3 py-1 bg-hyper-green text-carbon text-xs font-semibold rounded hover:bg-hyper-green/90"
							>
								Copy
							</button>
							<button
								type="button"
								onClick={() => setNewKeyDisplay(null)}
								className="px-3 py-1 btn-secondary text-xs font-semibold rounded"
							>
								Done
							</button>
						</div>
					</div>
				)}

				<CreateKeyForm
					method="post"
					action="/api/api-keys"
					onSubmit={handleCreate}
					className="mb-6 space-y-3"
				>
					<div className="flex gap-2 flex-wrap">
						<input
							type="text"
							inputMode="text"
							name="name"
							value={createName}
							onChange={(e) => setCreateName(e.target.value)}
							placeholder="Key name (e.g. nightly_export)"
							className="flex-1 min-w-[200px] max-w-xs px-4 py-2 bg-platinum/50 border border-carbon/10 rounded-lg text-carbon placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
							maxLength={100}
						/>
						<button
							type="submit"
							disabled={!canSubmit}
							className="px-4 py-2 bg-hyper-green text-carbon rounded-lg font-semibold text-sm hover:bg-hyper-green/90 disabled:opacity-50"
						>
							{createFetcher.state === "submitting"
								? "Creating..."
								: "Create key"}
						</button>
					</div>

					<ScopePresetPicker
						selectedScopes={selectedScopes}
						onScopesChange={setSelectedScopes}
					/>

					{selectedScopes.map((scope) => (
						<input key={scope} type="hidden" name="scopes" value={scope} />
					))}
				</CreateKeyForm>

				{createFetcher.data?.error && (
					<p className="text-sm text-danger mb-4">{createFetcher.data.error}</p>
				)}

				<div className="space-y-3">
					{apiKeys.length === 0 && !newKeyDisplay ? (
						<p className="text-sm text-muted">
							No API keys yet. Create one above.
						</p>
					) : (
						apiKeys.map((k) => <ApiKeyRowItem key={k.id} keyRecord={k} />)
					)}
				</div>

				{copyToast.isOpen && (
					<Toast
						variant="success"
						title="Copied"
						description="API key copied to clipboard"
						onDismiss={copyToast.hide}
					/>
				)}
			</section>

			<section className="glass-panel rounded-xl p-6">
				<h3 className="text-xs text-label text-muted mb-1">
					REST quick reference
				</h3>
				<dl className="space-y-3 text-sm">
					<div>
						<dt className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
							Base URL
						</dt>
						<dd>
							<code className="text-xs bg-platinum/50 px-3 py-2 rounded-lg font-mono text-carbon break-all block">
								{baseUrl}
							</code>
						</dd>
					</div>
					<div>
						<dt className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
							Authentication
						</dt>
						<dd className="text-muted space-y-1">
							{REST_QUICK_REF.authHeaders.map((header) => (
								<code
									key={header}
									className="block text-xs bg-platinum/50 px-2 py-1 rounded font-mono text-carbon w-fit"
								>
									{header}
								</code>
							))}
						</dd>
					</div>
					<div>
						<dt className="text-xs font-medium text-muted uppercase tracking-wide mb-1">
							Formats
						</dt>
						<dd className="text-muted text-sm">{REST_QUICK_REF.formatNote}</dd>
					</div>
				</dl>
				<p className="text-sm text-muted mt-4">
					<Link
						to="/docs/api#rest"
						className="text-hyper-green font-medium hover:underline"
					>
						Full REST reference →
					</Link>
				</p>
			</section>
		</div>
	);
}
