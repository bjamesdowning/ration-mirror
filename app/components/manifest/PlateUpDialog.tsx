import { useState } from "react";

interface PlateUpDialogProps {
	/** legacy: existing Eat/consume plate-up. eat: private Cook/Log-split serving log. */
	mode?: "legacy" | "eat";
	mealName: string;
	defaultServings?: number;
	/** legacy mode only. */
	onConfirm?: (servings: number, logNutrition: boolean) => void;
	/** eat mode only — servings + explicit first-use consent (when required). */
	onConfirmEat?: (servings: number, consent?: boolean) => void;
	/** eat mode only — shown when hasExistingIntake. */
	onRemoveLog?: () => void;
	onClose: () => void;
	/** eat mode only — hides the consent checkbox when already granted. */
	intakeConsentGranted?: boolean;
	/** eat mode only — surfaces "Remove my log" and edit copy. */
	hasExistingIntake?: boolean;
	/** eat mode only — label for the dismiss button (defaults to "Not now"). */
	notNowLabel?: string;
}

function formatServingsValue(value: number): string {
	return value % 1 === 0 ? String(value) : value.toFixed(1);
}

/**
 * Small plate-up dialog. Two modes:
 * - legacy: existing Eat/consume flow when nutrition-manifest is on.
 * - eat: private "Log my serving" flow for nutrition-cook-log-split.
 */
export function PlateUpDialog({
	mode = "legacy",
	mealName,
	defaultServings = 1,
	onConfirm,
	onConfirmEat,
	onRemoveLog,
	onClose,
	intakeConsentGranted = false,
	hasExistingIntake = false,
	notNowLabel,
}: PlateUpDialogProps) {
	const [servings, setServings] = useState(defaultServings);
	const [consentChecked, setConsentChecked] = useState(false);
	const isEat = mode === "eat";
	const needsConsent = isEat && !intakeConsentGranted;
	const validServings = Number.isFinite(servings) && servings > 0;
	const canSave = validServings && (!needsConsent || consentChecked);
	const dismissLabel = notNowLabel ?? (isEat ? "Not now" : "Cancel");

	return (
		<div
			className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-4 pb-24 sm:pb-4"
			role="dialog"
			aria-modal="true"
			aria-label={isEat ? "Log my serving" : "Log servings"}
		>
			<button
				type="button"
				className="absolute inset-0 bg-carbon/60 backdrop-blur-sm"
				onClick={onClose}
				aria-label="Close"
			/>

			<div className="relative z-10 w-full max-w-sm bg-ceramic border border-platinum rounded-2xl shadow-glow p-5 space-y-5">
				<div>
					<p className="text-[10px] font-mono font-semibold uppercase tracking-widest text-muted">
						{isEat ? "Private log" : "Plate-up"}
					</p>
					<h2 className="text-base font-bold text-carbon font-mono capitalize mt-0.5">
						{isEat ? "Log my serving" : mealName}
					</h2>
					<p className="text-sm text-muted mt-2">
						{isEat ? (
							<>
								<span className="capitalize">{mealName}</span> — this is your
								personal record and never changes shared Cargo.
							</>
						) : (
							"How many servings did you eat? This updates your day totals when nutrition logging is on."
						)}
					</p>
				</div>

				<label className="block space-y-2">
					<span className="text-xs font-mono text-muted uppercase tracking-wide">
						Servings
					</span>
					<input
						type="number"
						min={0.5}
						max={100}
						step={0.5}
						value={servings}
						onChange={(e) => {
							const next = Number(e.target.value);
							if (Number.isFinite(next)) setServings(next);
						}}
						className="w-full px-3 py-2.5 text-sm bg-transparent border border-platinum rounded-lg text-carbon font-mono focus:outline-none focus:border-hyper-green focus:ring-1 focus:ring-hyper-green"
					/>
				</label>

				{isEat && needsConsent && (
					<label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
						<input
							type="checkbox"
							checked={consentChecked}
							onChange={(e) => setConsentChecked(e.target.checked)}
							className="mt-0.5 accent-hyper-green"
						/>
						<span>
							I consent to Ration logging my personal nutrition intake.
						</span>
					</label>
				)}

				<div className="flex flex-col gap-2">
					{isEat ? (
						<>
							<button
								type="button"
								onClick={() =>
									onConfirmEat?.(
										servings,
										needsConsent ? consentChecked : undefined,
									)
								}
								disabled={!canSave}
								className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-hyper-green text-on-hyper-green hover:shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition-all"
							>
								{hasExistingIntake
									? `Save (was ${formatServingsValue(defaultServings)})`
									: "Save"}
							</button>
							{hasExistingIntake && (
								<button
									type="button"
									onClick={() => onRemoveLog?.()}
									className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border border-red-300 text-red-500 hover:bg-red-500/10 transition-colors"
								>
									Remove my log
								</button>
							)}
							<button
								type="button"
								onClick={onClose}
								className="w-full px-4 py-2 text-sm text-muted hover:text-carbon transition-colors"
							>
								{dismissLabel}
							</button>
						</>
					) : (
						<>
							<button
								type="button"
								onClick={() => onConfirm?.(servings, true)}
								disabled={!validServings}
								className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-hyper-green text-on-hyper-green hover:shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition-all"
							>
								Consume &amp; log
							</button>
							<button
								type="button"
								onClick={() => onConfirm?.(servings > 0 ? servings : 1, false)}
								className="w-full px-4 py-2.5 text-sm font-medium rounded-lg border border-platinum text-muted hover:text-carbon hover:bg-platinum/40 transition-colors"
							>
								Skip calorie log
							</button>
							<button
								type="button"
								onClick={onClose}
								className="w-full px-4 py-2 text-sm text-muted hover:text-carbon transition-colors"
							>
								{dismissLabel}
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
