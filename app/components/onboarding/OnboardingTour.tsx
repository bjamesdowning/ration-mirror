import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { Step0_Welcome } from "./steps/Step0_Welcome";
import { Step1_Features } from "./steps/Step1_Features";
import { Step1_Groups } from "./steps/Step1_Groups";
import { Step2_Cargo } from "./steps/Step2_Cargo";
import { Step3_Galley } from "./steps/Step3_Galley";
import { Step4_Manifest } from "./steps/Step4_Manifest";
import { Step5_Supply } from "./steps/Step5_Supply";
import { Step6_Launch } from "./steps/Step6_Launch";
import { TourOverlay } from "./TourOverlay";

interface OnboardingTourProps {
	/** Whether the user has already completed onboarding */
	isCompleted: boolean;
	/** The last step index the user reached (for resume) */
	initialStep: number;
	/** When false, skip Feature enablement (Flagship off). */
	featureEnablementEnabled?: boolean;
}

/** Spotlight routes after Welcome (0) + Features (1). */
const STEP_ROUTES: Record<number, string> = {
	2: "/hub/settings#group",
	3: "/hub/cargo",
	4: "/hub/galley",
	5: "/hub/manifest",
	6: "/hub/supply",
};

const LAST_STEP = 7;

/**
 * Orchestrates the full onboarding tour.
 * 0 Welcome → 1 Feature enablement → 2–6 spotlights → 7 Launch.
 */
export function OnboardingTour({
	isCompleted,
	initialStep,
	featureEnablementEnabled = false,
}: OnboardingTourProps) {
	const [open, setOpen] = useState(!isCompleted);
	const [step, setStep] = useState(() => Math.min(initialStep, LAST_STEP));
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const featuresFetcher = useFetcher();
	const hasPersisted = useRef(false);
	const recordedOptOut = useRef(false);

	const prevIsCompleted = useRef(isCompleted);
	useEffect(() => {
		if (prevIsCompleted.current && !isCompleted) {
			hasPersisted.current = false;
			recordedOptOut.current = false;
			setStep(0);
			setOpen(true);
		}
		prevIsCompleted.current = isCompleted;
	}, [isCompleted]);

	const persistStep = useCallback(
		(nextStep: number, completed = false) => {
			const formData = new FormData();
			formData.set("intent", "update-onboarding");
			formData.set("onboardingStep", String(nextStep));
			if (completed) {
				formData.set("onboardingCompletedAt", new Date().toISOString());
			}
			fetcher.submit(formData, {
				method: "post",
				action: "/hub/settings",
			});
		},
		[fetcher],
	);

	const recordExplicitOptOut = useCallback(() => {
		if (!featureEnablementEnabled || recordedOptOut.current) return;
		recordedOptOut.current = true;
		featuresFetcher.submit(
			JSON.stringify({
				action: "set",
				aiFeatures: false,
				macroTracking: false,
				requestId: crypto.randomUUID(),
			}),
			{
				method: "POST",
				action: "/api/privacy/features",
				encType: "application/json",
			},
		);
	}, [featureEnablementEnabled, featuresFetcher]);

	const goTo = useCallback(
		(nextStep: number) => {
			setStep(nextStep);
			if (nextStep in STEP_ROUTES) {
				navigate(STEP_ROUTES[nextStep]);
			}
			persistStep(nextStep);
		},
		[navigate, persistStep],
	);

	const afterWelcome = useCallback(() => {
		goTo(featureEnablementEnabled ? 1 : 2);
	}, [featureEnablementEnabled, goTo]);

	const handleNext = useCallback(() => {
		if (step < LAST_STEP) goTo(step + 1);
	}, [step, goTo]);

	const handleBack = useCallback(() => {
		if (step === 2 && !featureEnablementEnabled) {
			goTo(0);
			return;
		}
		if (step > 0) goTo(step - 1);
	}, [step, goTo, featureEnablementEnabled]);

	const handleSkip = useCallback(() => {
		if (featureEnablementEnabled && (step === 0 || step === 1)) {
			recordExplicitOptOut();
		}
		if (!hasPersisted.current) {
			hasPersisted.current = true;
			persistStep(step, true);
		}
		setOpen(false);
	}, [step, persistStep, featureEnablementEnabled, recordExplicitOptOut]);

	const handleComplete = useCallback(() => {
		hasPersisted.current = true;
		persistStep(LAST_STEP, true);
		setOpen(false);
	}, [persistStep]);

	useEffect(() => {
		if (!open) return;

		function onKey(e: KeyboardEvent) {
			if (step === 1) {
				if (e.key === "Escape") handleSkip();
				return;
			}
			if (e.key === "Escape") handleSkip();
			else if (e.key === "ArrowRight") handleNext();
			else if (e.key === "ArrowLeft") handleBack();
		}

		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, step, handleSkip, handleNext, handleBack]);

	const stepRef = useRef(step);
	const navigateRef = useRef(navigate);
	useEffect(() => {
		stepRef.current = step;
		navigateRef.current = navigate;
	});

	useEffect(() => {
		if (!open) return;
		const s = stepRef.current;
		if (s in STEP_ROUTES) {
			navigateRef.current(STEP_ROUTES[s]);
		}
	}, [open]);

	if (!open) return null;

	const stepProps = {
		step,
		onNext: handleNext,
		onBack: handleBack,
		onSkip: handleSkip,
	};

	const isFullscreen =
		step === 0 ||
		(step === 1 && featureEnablementEnabled) ||
		step === LAST_STEP;

	return (
		<TourOverlay onSkip={handleSkip} fullscreen={isFullscreen}>
			{step === 0 && (
				<Step0_Welcome onBegin={afterWelcome} onSkip={handleSkip} />
			)}
			{step === 1 && featureEnablementEnabled && (
				<Step1_Features onContinue={() => goTo(2)} onSkip={handleSkip} />
			)}
			{step === 2 && <Step1_Groups {...stepProps} />}
			{step === 3 && <Step2_Cargo {...stepProps} />}
			{step === 4 && <Step3_Galley {...stepProps} />}
			{step === 5 && <Step4_Manifest {...stepProps} />}
			{step === 6 && <Step5_Supply {...stepProps} />}
			{step === LAST_STEP && (
				<Step6_Launch
					onBack={handleBack}
					onComplete={handleComplete}
					onSkip={handleSkip}
				/>
			)}
		</TourOverlay>
	);
}
