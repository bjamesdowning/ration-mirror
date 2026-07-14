import type { CopilotModelPreset } from "~/lib/copilot/model-profiles";

type CopilotModelPresetSelectorProps = {
	value: CopilotModelPreset;
	onChange: (preset: CopilotModelPreset) => void;
	disabled?: boolean;
};

export function CopilotModelPresetSelector({
	value,
	onChange,
	disabled = false,
}: CopilotModelPresetSelectorProps) {
	return (
		<fieldset className="space-y-1 border-0 p-0">
			<legend className="sr-only">Copilot thinking mode</legend>
			<div className="inline-flex rounded-full border border-platinum/70 bg-white/80 p-0.5 dark:border-white/10 dark:bg-white/[0.04]">
				{(["fast", "deep"] as const).map((preset) => {
					const active = value === preset;
					return (
						<button
							key={preset}
							type="button"
							disabled={disabled}
							onClick={() => onChange(preset)}
							className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
								active
									? "bg-hyper-green text-carbon"
									: "text-muted hover:text-carbon"
							} disabled:opacity-40`}
						>
							{preset}
						</button>
					);
				})}
			</div>
			<p className="text-[10px] text-muted">
				Deep thinking may use more tokens and credits.
			</p>
		</fieldset>
	);
}
