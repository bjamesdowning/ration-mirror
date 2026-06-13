import { useState } from "react";
import type { ApiScope } from "~/lib/schemas/api-keys";
import {
	findMatchingPreset,
	MCP_SCOPE_ORDER,
	REST_SCOPE_ORDER,
	SCOPE_META,
	SCOPE_PRESETS,
	type ScopePresetId,
} from "./scope-meta";

type ScopePresetPickerProps = {
	selectedScopes: ApiScope[];
	onScopesChange: (scopes: ApiScope[]) => void;
};

export function ScopePresetPicker({
	selectedScopes,
	onScopesChange,
}: ScopePresetPickerProps) {
	const [customExpanded, setCustomExpanded] = useState(false);
	const activePreset = findMatchingPreset(selectedScopes);

	const applyPreset = (presetId: ScopePresetId) => {
		const preset = SCOPE_PRESETS.find((p) => p.id === presetId);
		if (preset) onScopesChange([...preset.scopes]);
	};

	const toggleScope = (scope: ApiScope) => {
		onScopesChange(
			selectedScopes.includes(scope)
				? selectedScopes.filter((s) => s !== scope)
				: [...selectedScopes, scope],
		);
		setCustomExpanded(true);
	};

	return (
		<div>
			<p className="text-xs text-muted mb-2 font-medium uppercase tracking-wide">
				Scopes
			</p>
			<div className="flex flex-wrap gap-2 mb-3">
				{SCOPE_PRESETS.map((preset) => {
					const active = activePreset === preset.id;
					return (
						<button
							key={preset.id}
							type="button"
							title={preset.description}
							onClick={() => applyPreset(preset.id)}
							className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
								active
									? "bg-hyper-green/20 text-hyper-green border-hyper-green/40"
									: "bg-platinum/30 text-muted border-carbon/10 hover:border-carbon/30"
							}`}
						>
							{preset.label}
						</button>
					);
				})}
			</div>

			<button
				type="button"
				onClick={() => setCustomExpanded((v) => !v)}
				className="text-xs font-medium text-hyper-green hover:underline"
			>
				{customExpanded ? "Hide custom scopes" : "Customize scopes"}
			</button>

			{customExpanded && (
				<div className="mt-3 space-y-3">
					<div>
						<p className="text-[11px] text-muted mb-1 uppercase tracking-wide">
							REST API
						</p>
						<div className="flex flex-wrap gap-2">
							{REST_SCOPE_ORDER.map((scope) => (
								<ScopePill
									key={scope}
									scope={scope}
									active={selectedScopes.includes(scope)}
									onToggle={() => toggleScope(scope)}
									variant="rest"
								/>
							))}
						</div>
					</div>
					<div>
						<p className="text-[11px] text-muted mb-1 uppercase tracking-wide">
							Advanced MCP (manual auth)
						</p>
						<div className="flex flex-wrap gap-2">
							{MCP_SCOPE_ORDER.map((scope) => (
								<ScopePill
									key={scope}
									scope={scope}
									active={selectedScopes.includes(scope)}
									onToggle={() => toggleScope(scope)}
									variant="mcp"
								/>
							))}
						</div>
						<p className="text-xs text-muted mt-2">
							Prefer granular <code className="font-mono">mcp:*</code> scopes.
							Use <code className="font-mono">mcp</code> only for legacy full
							access.
						</p>
					</div>
				</div>
			)}

			{selectedScopes.length === 0 && (
				<p className="text-xs text-danger mt-2">Select at least one scope.</p>
			)}
		</div>
	);
}

function ScopePill({
	scope,
	active,
	onToggle,
	variant,
}: {
	scope: ApiScope;
	active: boolean;
	onToggle: () => void;
	variant: "rest" | "mcp";
}) {
	const meta = SCOPE_META[scope];
	const activeClass =
		variant === "mcp"
			? "bg-hyper-green/20 text-hyper-green border-hyper-green/40"
			: "bg-carbon text-ceramic border-carbon";

	return (
		<button
			type="button"
			onClick={onToggle}
			title={meta.description}
			className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
				active
					? activeClass
					: "bg-platinum/30 text-muted border-carbon/10 hover:border-carbon/30"
			}`}
		>
			{active && (
				<svg
					className="w-3 h-3 shrink-0"
					viewBox="0 0 12 12"
					fill="currentColor"
					role="presentation"
				>
					<path
						d="M10 3L5 8.5 2 5.5"
						stroke="currentColor"
						strokeWidth="1.5"
						fill="none"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
			{meta.label}
		</button>
	);
}
