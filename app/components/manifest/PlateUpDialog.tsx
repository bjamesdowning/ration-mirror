import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";

type IntakeConsentStatus = {
	purpose: "goals" | "intake" | "agent_processing";
	state: "active" | "not_granted" | "withdrawn" | "reconsent_required";
	statement: {
		policyVersion: string;
		statementVersion: string;
		sha256: string;
		text: string;
	};
};

type NutritionPrivacyResponse = {
	ok?: boolean;
	consents?: IntakeConsentStatus[];
	error?: string;
};

interface PlateUpDialogProps {
	/** legacy: existing Eat/consume plate-up. eat: private Cook/Log-split serving log. */
	mode?: "legacy" | "eat";
	mealName: string;
	defaultServings?: number;
	/** Per-serving macros for live scaled preview (eat mode). */
	energyKcalPerServing?: number | null;
	proteinGPerServing?: number | null;
	carbsGPerServing?: number | null;
	fatGPerServing?: number | null;
	/** legacy mode only. */
	onConfirm?: (servings: number, logNutrition: boolean) => void;
	/** eat mode only — consent is established through the privacy route first. */
	onConfirmEat?: (servings: number, notes: string | null) => void;
	/** eat mode only — shown when hasExistingIntake. */
	onRemoveLog?: () => void;
	onClose: () => void;
	/** eat mode only — hides the consent checkbox when already granted. */
	intakeConsentGranted?: boolean;
	/** eat mode only — surfaces "Remove my log" and edit copy. */
	hasExistingIntake?: boolean;
	/** eat mode only — optional private notes field when flag on. */
	notesEnabled?: boolean;
	defaultNotes?: string | null;
	/** eat mode only — label for the dismiss button (defaults to "Not now"). */
	notNowLabel?: string;
}

function formatServingsValue(value: number): string {
	return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function formatGrams(value: number): string {
	return value % 1 === 0 ? `${value} g` : `${value.toFixed(1)} g`;
}

function scaleMacro(
	perServing: number | null | undefined,
	servings: number,
): number | null {
	if (perServing == null || !Number.isFinite(perServing)) return null;
	if (!Number.isFinite(servings) || servings <= 0) return null;
	return perServing * servings;
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
	energyKcalPerServing = null,
	proteinGPerServing = null,
	carbsGPerServing = null,
	fatGPerServing = null,
	onConfirm,
	onConfirmEat,
	onRemoveLog,
	onClose,
	intakeConsentGranted = false,
	hasExistingIntake = false,
	notesEnabled = false,
	defaultNotes = null,
	notNowLabel,
}: PlateUpDialogProps) {
	const [servings, setServings] = useState(defaultServings);
	const [notes, setNotes] = useState(defaultNotes ?? "");
	const [consentChecked, setConsentChecked] = useState(false);
	const [pendingServings, setPendingServings] = useState<number | null>(null);
	const [pendingNotes, setPendingNotes] = useState<string | null>(null);
	const privacyFetcher = useFetcher<NutritionPrivacyResponse>();
	const isEat = mode === "eat";
	const intakeConsent = privacyFetcher.data?.consents?.find(
		(status) => status.purpose === "intake",
	);
	const activeConsent =
		intakeConsentGranted || intakeConsent?.state === "active";
	const needsConsent = isEat && !activeConsent;
	const validServings = Number.isFinite(servings) && servings > 0;
	const canSave =
		validServings &&
		(!needsConsent || (consentChecked && intakeConsent != null)) &&
		privacyFetcher.state === "idle";
	const dismissLabel = notNowLabel ?? (isEat ? "Not now" : "Cancel");
	const trimmedNotes = notes.trim();
	const notesPayload =
		notesEnabled && trimmedNotes.length > 0 ? trimmedNotes.slice(0, 280) : null;

	const scaledEnergy = scaleMacro(energyKcalPerServing, servings);
	const scaledProtein = scaleMacro(proteinGPerServing, servings);
	const scaledCarbs = scaleMacro(carbsGPerServing, servings);
	const scaledFat = scaleMacro(fatGPerServing, servings);
	const hasMacroPreview =
		scaledEnergy != null ||
		scaledProtein != null ||
		scaledCarbs != null ||
		scaledFat != null;

	useEffect(() => {
		if (
			isEat &&
			!intakeConsentGranted &&
			privacyFetcher.state === "idle" &&
			privacyFetcher.data == null
		) {
			privacyFetcher.load("/api/privacy/nutrition");
		}
	}, [isEat, intakeConsentGranted, privacyFetcher]);

	useEffect(() => {
		if (
			pendingServings != null &&
			privacyFetcher.state === "idle" &&
			intakeConsent?.state === "active"
		) {
			const confirmedServings = pendingServings;
			const confirmedNotes = pendingNotes;
			setPendingServings(null);
			setPendingNotes(null);
			onConfirmEat?.(confirmedServings, confirmedNotes);
		}
	}, [
		pendingServings,
		pendingNotes,
		privacyFetcher.state,
		intakeConsent,
		onConfirmEat,
	]);

	const handleEatSave = () => {
		if (!canSave) return;
		if (!needsConsent) {
			onConfirmEat?.(servings, notesPayload);
			return;
		}
		if (!intakeConsent || !consentChecked) return;
		setPendingServings(servings);
		setPendingNotes(notesPayload);
		privacyFetcher.submit(
			JSON.stringify({
				action: "grant",
				purpose: "intake",
				policyVersion: intakeConsent.statement.policyVersion,
				statementVersion: intakeConsent.statement.statementVersion,
				statementSha256: intakeConsent.statement.sha256,
				affirmed: true,
				requestId: crypto.randomUUID(),
			}),
			{
				method: "POST",
				action: "/api/privacy/nutrition",
				encType: "application/json",
			},
		);
	};

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
							"How many servings should we deduct from Cargo? Personal calorie logging uses Log my serving after Cook."
						)}
					</p>
					{isEat ? (
						<p className="text-[10px] text-muted mt-2">
							Not medical advice. Goals and totals are planning aids only.
						</p>
					) : null}
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

				{isEat ? (
					<div className="rounded-lg border border-platinum p-3 space-y-2">
						{hasMacroPreview ? (
							<>
								{scaledEnergy != null ? (
									<div className="flex justify-between text-xs font-mono text-carbon">
										<span>Calories</span>
										<span>{Math.round(scaledEnergy)} kcal</span>
									</div>
								) : null}
								{scaledProtein != null ? (
									<div className="flex justify-between text-xs font-mono text-carbon">
										<span>Protein</span>
										<span>{formatGrams(scaledProtein)}</span>
									</div>
								) : null}
								{scaledCarbs != null ? (
									<div className="flex justify-between text-xs font-mono text-carbon">
										<span>Carbs</span>
										<span>{formatGrams(scaledCarbs)}</span>
									</div>
								) : null}
								{scaledFat != null ? (
									<div className="flex justify-between text-xs font-mono text-carbon">
										<span>Fat</span>
										<span>{formatGrams(scaledFat)}</span>
									</div>
								) : null}
								<p className="text-[10px] text-muted">
									Estimates scale with portion. Saving logs these nutrients to
									your private intake.
								</p>
							</>
						) : (
							<p className="text-xs text-muted">
								Nutrition unavailable for this meal.
							</p>
						)}
					</div>
				) : null}

				{isEat && notesEnabled ? (
					<label className="block space-y-2">
						<span className="text-xs font-mono text-muted uppercase tracking-wide">
							Notes (optional)
						</span>
						<textarea
							value={notes}
							maxLength={280}
							rows={3}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Private note for this log"
							className="w-full px-3 py-2.5 text-sm bg-transparent border border-platinum rounded-lg text-carbon font-mono focus:outline-none focus:border-hyper-green focus:ring-1 focus:ring-hyper-green resize-none"
						/>
						<span className="text-[10px] font-mono text-muted">
							{Math.min(notes.trim().length, 280)}/280
						</span>
					</label>
				) : null}

				{isEat && needsConsent && (
					<div className="rounded-lg border border-platinum p-3">
						{intakeConsent ? (
							<>
								<p className="text-xs leading-relaxed text-muted">
									{intakeConsent.statement.text}
								</p>
								<label className="mt-3 flex items-start gap-2 text-xs text-carbon cursor-pointer">
									<input
										type="checkbox"
										checked={consentChecked}
										onChange={(event) =>
											setConsentChecked(event.target.checked)
										}
										className="mt-0.5 accent-hyper-green"
									/>
									<span>
										I have read this statement and explicitly consent.
									</span>
								</label>
								<p className="mt-2 text-[10px] font-mono text-muted">
									{intakeConsent.statement.statementVersion} ·{" "}
									<Link to="/legal/privacy" className="underline">
										Privacy Policy
									</Link>
								</p>
							</>
						) : (
							<p className="text-xs text-muted">
								Loading the current privacy statement…
							</p>
						)}
					</div>
				)}

				{privacyFetcher.data?.error && (
					<p className="text-xs text-error">{privacyFetcher.data.error}</p>
				)}

				<div className="flex flex-col gap-2">
					{isEat ? (
						<>
							<button
								type="button"
								onClick={handleEatSave}
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
							{/* Personal intake is Eat-only (cook-log-split); Consume never writes nutrition_intake. */}
							<button
								type="button"
								onClick={() => onConfirm?.(servings > 0 ? servings : 1, false)}
								disabled={!validServings}
								className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg bg-hyper-green text-on-hyper-green hover:shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition-all"
							>
								Consume
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
