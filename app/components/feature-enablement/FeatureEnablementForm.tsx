import { useCallback, useEffect, useId, useState } from "react";
import { Link, useFetcher } from "react-router";

export type FeatureEnablementStatusResponse = {
	ok?: boolean;
	aiFeatures?: boolean;
	macroTracking?: boolean;
	autoDeductConsent?: boolean;
	aiConsentAt?: string | null;
	consents?: Array<{
		purpose: string;
		state: string;
		statement: { text: string; statementVersion: string };
	}>;
	error?: string;
};

type FeatureEnablementFormProps = {
	/** Compact layout for onboarding modal */
	variant?: "onboarding" | "settings";
	onSaved?: (status: FeatureEnablementStatusResponse) => void;
	/** Onboarding: called after successful Agree/Continue */
	onContinue?: () => void;
	/** Show Continue even when saving opt-outs */
	continueLabel?: string;
};

/**
 * Shared AI Features + Macro Tracking toggles.
 * Defaults ON for first paint when status has not loaded yet (opt-out model).
 */
export function FeatureEnablementForm({
	variant = "settings",
	onSaved,
	onContinue,
	continueLabel = "Agree & Continue",
}: FeatureEnablementFormProps) {
	const loadFetcher = useFetcher<FeatureEnablementStatusResponse>();
	const saveFetcher = useFetcher<FeatureEnablementStatusResponse>();
	const [aiFeatures, setAiFeatures] = useState(true);
	const [macroTracking, setMacroTracking] = useState(true);
	const [loaded, setLoaded] = useState(false);
	const [showStatements, setShowStatements] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const aiId = useId();
	const macroId = useId();
	const isSaving = saveFetcher.state !== "idle";

	useEffect(() => {
		if (loadFetcher.state === "idle" && loadFetcher.data == null) {
			loadFetcher.load("/api/privacy/features");
		}
	}, [loadFetcher]);

	useEffect(() => {
		if (!loadFetcher.data || loaded) return;
		if (typeof loadFetcher.data.aiFeatures === "boolean") {
			setAiFeatures(loadFetcher.data.aiFeatures);
			setMacroTracking(Boolean(loadFetcher.data.macroTracking));
			setLoaded(true);
		}
		if (loadFetcher.data.error) {
			setError(loadFetcher.data.error);
		}
	}, [loadFetcher.data, loaded]);

	useEffect(() => {
		if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
		if (saveFetcher.data.error) {
			setError(saveFetcher.data.error);
			return;
		}
		if (typeof saveFetcher.data.aiFeatures === "boolean") {
			setAiFeatures(saveFetcher.data.aiFeatures);
			setMacroTracking(Boolean(saveFetcher.data.macroTracking));
			onSaved?.(saveFetcher.data);
			onContinue?.();
		}
	}, [saveFetcher.state, saveFetcher.data, onSaved, onContinue]);

	const submitSet = useCallback(() => {
		setError(null);
		const body: Record<string, unknown> = {
			action: "set",
			aiFeatures,
			macroTracking,
			requestId: crypto.randomUUID(),
		};
		if (aiFeatures || macroTracking) {
			body.affirmed = true;
		}
		saveFetcher.submit(JSON.stringify(body), {
			method: "POST",
			action: "/api/privacy/features",
			encType: "application/json",
		});
	}, [aiFeatures, macroTracking, saveFetcher]);

	const toggleFeature = useCallback(
		(feature: "ai" | "macro", enabled: boolean) => {
			if (variant !== "settings" || !loaded) {
				if (feature === "ai") setAiFeatures(enabled);
				else setMacroTracking(enabled);
				return;
			}
			setError(null);
			if (feature === "ai") setAiFeatures(enabled);
			else setMacroTracking(enabled);
			const body = enabled
				? {
						action: "enable" as const,
						feature,
						affirmed: true as const,
						requestId: crypto.randomUUID(),
					}
				: {
						action: "disable" as const,
						feature,
						requestId: crypto.randomUUID(),
					};
			saveFetcher.submit(JSON.stringify(body), {
				method: "POST",
				action: "/api/privacy/features",
				encType: "application/json",
			});
		},
		[variant, loaded, saveFetcher],
	);

	const erase = useCallback(
		(dataset: "goals" | "intake" | "all") => {
			const label =
				dataset === "all"
					? "Erase all nutrition goals and intake history?"
					: dataset === "goals"
						? "Erase nutrition goals?"
						: "Erase intake history?";
			if (
				!window.confirm(
					`${label} Consent records are kept as evidence. Withdrawal is separate.`,
				)
			) {
				return;
			}
			setError(null);
			saveFetcher.submit(
				JSON.stringify({
					action: "erase",
					dataset,
					requestId: crypto.randomUUID(),
				}),
				{
					method: "POST",
					action: "/api/privacy/features",
					encType: "application/json",
				},
			);
		},
		[saveFetcher],
	);

	const consents = loadFetcher.data?.consents ?? saveFetcher.data?.consents;
	const isOnboarding = variant === "onboarding";

	return (
		<div className={isOnboarding ? "space-y-4" : "space-y-5"}>
			<div className="space-y-3">
				<label
					htmlFor={aiId}
					className="flex items-start gap-3 p-3 rounded-xl border border-platinum dark:border-white/10 bg-platinum/20 dark:bg-white/5 cursor-pointer"
				>
					<input
						id={aiId}
						type="checkbox"
						className="mt-1 accent-hyper-green"
						checked={aiFeatures}
						disabled={isSaving}
						onChange={(e) => {
							if (isOnboarding) setAiFeatures(e.target.checked);
							else toggleFeature("ai", e.target.checked);
						}}
					/>
					<span className="min-w-0">
						<span className="block text-sm font-semibold text-carbon dark:text-white">
							AI Features
						</span>
						<span className="block text-xs text-muted mt-0.5">
							Scan, generate meals, Ask Ration, and auto-use credits when your
							Crew allowance runs out.
						</span>
					</span>
				</label>

				<label
					htmlFor={macroId}
					className="flex items-start gap-3 p-3 rounded-xl border border-platinum dark:border-white/10 bg-platinum/20 dark:bg-white/5 cursor-pointer"
				>
					<input
						id={macroId}
						type="checkbox"
						className="mt-1 accent-hyper-green"
						checked={macroTracking}
						disabled={isSaving}
						onChange={(e) => {
							if (isOnboarding) setMacroTracking(e.target.checked);
							else toggleFeature("macro", e.target.checked);
						}}
					/>
					<span className="min-w-0">
						<span className="block text-sm font-semibold text-carbon dark:text-white">
							Macro Tracking
						</span>
						<span className="block text-xs text-muted mt-0.5">
							Personal nutrition goals, Eat / plate-up logging, and Copilot or
							connected-agent nutrition tools.
						</span>
					</span>
				</label>
			</div>

			<p className="text-[11px] text-muted">
				Features are on by default. Turn one off if you prefer not to use it.
				You can change this anytime in Settings.{" "}
				<Link to="/legal/privacy" className="underline">
					Privacy Policy
				</Link>
			</p>

			<button
				type="button"
				className="text-[11px] text-hyper-green underline"
				onClick={() => setShowStatements((v) => !v)}
			>
				{showStatements ? "Hide" : "Show"} full Macro Tracking statements
			</button>
			{showStatements && consents && (
				<div className="space-y-2 max-h-40 overflow-y-auto text-[10px] text-muted border border-platinum dark:border-white/10 rounded-lg p-2">
					{consents.map((c) => (
						<p key={c.purpose}>
							<span className="font-semibold text-carbon dark:text-white">
								{c.purpose}
							</span>
							: {c.statement.text}
						</p>
					))}
				</div>
			)}

			{error && (
				<p className="text-xs text-red-600 dark:text-red-400" role="alert">
					{error}
				</p>
			)}

			{isOnboarding && (
				<button
					type="button"
					disabled={isSaving}
					onClick={submitSet}
					className="w-full px-6 py-2.5 bg-hyper-green text-on-hyper-green font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all text-sm disabled:opacity-60"
				>
					{isSaving ? "Saving…" : continueLabel}
				</button>
			)}

			{!isOnboarding && (
				<div className="space-y-2 pt-2 border-t border-platinum dark:border-white/10">
					<p className="text-xs font-semibold text-carbon dark:text-white">
						Erase Macro Tracking data
					</p>
					<p className="text-[11px] text-muted">
						Withdrawing a feature stops future processing. Erase permanently
						deletes stored goals or intake.
					</p>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className="text-xs px-2.5 py-1.5 rounded-md border border-platinum dark:border-white/10 text-carbon dark:text-white"
							disabled={isSaving}
							onClick={() => erase("goals")}
						>
							Erase goals
						</button>
						<button
							type="button"
							className="text-xs px-2.5 py-1.5 rounded-md border border-platinum dark:border-white/10 text-carbon dark:text-white"
							disabled={isSaving}
							onClick={() => erase("intake")}
						>
							Erase intake
						</button>
						<button
							type="button"
							className="text-xs px-2.5 py-1.5 rounded-md border border-red-300 text-red-700 dark:text-red-400"
							disabled={isSaving}
							onClick={() => erase("all")}
						>
							Erase all nutrition data
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
