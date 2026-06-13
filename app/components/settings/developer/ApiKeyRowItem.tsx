import { useFetcher } from "react-router";
import { useConfirm } from "~/lib/confirm-context";
import { type ApiScope, VALID_API_SCOPES } from "~/lib/schemas/api-keys";
import { SCOPE_META } from "./scope-meta";
import type { ApiKeyRow } from "./types";

export function ApiKeyRowItem({ keyRecord }: { keyRecord: ApiKeyRow }) {
	const { confirm } = useConfirm();
	const revokeFetcher = useFetcher<{ success?: boolean; error?: string }>();

	const handleRevoke = async () => {
		if (
			!(await confirm({
				title: "Revoke this API key?",
				message: "It will stop working immediately.",
				confirmLabel: "Revoke",
				variant: "danger",
			}))
		)
			return;
		revokeFetcher.submit(null, {
			method: "delete",
			action: `/api/api-keys/${keyRecord.id}`,
		});
	};

	let parsedScopes: ApiScope[] = [];
	try {
		const raw = JSON.parse(keyRecord.scopes);
		if (Array.isArray(raw)) {
			parsedScopes = raw.filter(
				(s): s is ApiScope =>
					typeof s === "string" &&
					(VALID_API_SCOPES as readonly string[]).includes(s),
			);
		}
	} catch {
		// malformed scopes — render nothing
	}

	return (
		<div className="flex items-center justify-between p-3 bg-platinum/30 rounded-lg">
			<div>
				<div className="flex items-center gap-2 mb-0.5 flex-wrap">
					<p className="font-medium text-carbon text-sm">{keyRecord.name}</p>
					<div className="flex gap-1 flex-wrap">
						{parsedScopes.map((scope) => (
							<span
								key={scope}
								className={`px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${SCOPE_META[scope].color}`}
							>
								{SCOPE_META[scope].label}
							</span>
						))}
					</div>
				</div>
				<p className="text-xs font-mono text-muted">{keyRecord.keyPrefix}...</p>
				<p className="text-xs text-muted mt-1">
					Last used:{" "}
					{keyRecord.lastUsedAt
						? new Date(keyRecord.lastUsedAt).toLocaleString()
						: "Never"}
				</p>
			</div>
			<button
				type="button"
				onClick={handleRevoke}
				disabled={revokeFetcher.state !== "idle"}
				className="px-3 py-1 text-danger text-sm font-medium hover:bg-danger/10 rounded shrink-0"
			>
				{revokeFetcher.state === "submitting" ? "Revoking..." : "Revoke"}
			</button>
		</div>
	);
}
