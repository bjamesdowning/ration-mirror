import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { Step0_Welcome } from "./steps/Step0_Welcome";
import { Step1_Cargo } from "./steps/Step1_Cargo";
import { Step2_Galley } from "./steps/Step2_Galley";
import { Step3_Manifest } from "./steps/Step3_Manifest";
import { Step4_Supply } from "./steps/Step4_Supply";
import { Step5_Launch } from "./steps/Step5_Launch";
import { TourOverlay } from "./TourOverlay";

interface OnboardingTourProps {
	/** Whether the user has already completed onboarding */
	isCompleted: boolean;
	/** The last step index the user reached (for resume) */
	initialStep: number;
}

const STEP_ROUTES: Record<number, string> = {
	1: "/hub/cargo",
	2: "/hub/galley",
	3: "/hub/manifest",
	4: "/hub/supply",
};

/**
 * Orchestrates the full onboarding tour.
 * - Auto-launches for first-time users (isCompleted = false).
 * - Navigates to the relevant hub page when a spotlight step is reached.
 * - Persists step progress on every advance and writes onboardingCompletedAt on finish.
 * - Keyboard: Esc = skip, ArrowRight = next, ArrowLeft = back.
 */
export function OnboardingTour({
	isCompleted,
	initialStep,
}: OnboardingTourProps) {
	const [open, setOpen] = useState(!isCompleted);
	const [step, setStep] = useState(() => Math.min(initialStep, 5));
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const hasPersisted = useRef(false);

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

	const goTo = useCallback(
		(nextStep: number) => {
			setStep(nextStep);
			// Navigate to the page this step spotlights
			if (nextStep in STEP_ROUTES) {
				navigate(STEP_ROUTES[nextStep]);
			}
			persistStep(nextStep);
		},
		[navigate, persistStep],
	);

	const handleNext = useCallback(() => {
		if (step < 5) goTo(step + 1);
	}, [step, goTo]);

	const handleBack = useCallback(() => {
		if (step > 0) goTo(step - 1);
	}, [step, goTo]);

	const handleSkip = useCallback(() => {
		if (!hasPersisted.current) {
			hasPersisted.current = true;
			persistStep(step, true);
		}
		setOpen(false);
	}, [step, persistStep]);

	const handleComplete = useCallback(() => {
		// hasPersisted may already be true if skip fired during the confetti delay.
		// Always write completion — the timestamp is idempotent and more accurate here.
		hasPersisted.current = true;
		persistStep(5, true);
		setOpen(false);
	}, [persistStep]);

	// Keyboard navigation
	useEffect(() => {
		if (!open) return;

		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") handleSkip();
			else if (e.key === "ArrowRight") handleNext();
			else if (e.key === "ArrowLeft") handleBack();
		}

		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, handleSkip, handleNext, handleBack]);

	// Keep a ref to the latest step + navigate so the open-effect doesn't need them as deps.
	// The effect only needs to fire when `open` transitions to true (resume on re-open);
	// step changes during the tour are handled directly by `goTo`.
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

	// Steps 0 and 5 are intentional full-screen moments; steps 1–4 are spotlight
	// steps where the user should see the page behind the card.
	const isFullscreen = step === 0 || step === 5;

	return (
		<TourOverlay onSkip={handleSkip} fullscreen={isFullscreen}>
			{step === 0 && (
				<Step0_Welcome onBegin={() => goTo(1)} onSkip={handleSkip} />
			)}
			{step === 1 && <Step1_Cargo {...stepProps} />}
			{step === 2 && <Step2_Galley {...stepProps} />}
			{step === 3 && <Step3_Manifest {...stepProps} />}
			{step === 4 && <Step4_Supply {...stepProps} />}
			{step === 5 && (
				<Step5_Launch
					onBack={handleBack}
					onComplete={handleComplete}
					onSkip={handleSkip}
				/>
			)}
		</TourOverlay>
	);
}
