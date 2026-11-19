/** Shared orbital-scan timing. iOS `AiWaitMotion` must use these same numbers. */
export const AI_WAIT_MOTION = {
	sweepSeconds: 2.4,
	breatheSeconds: 1.8,
	orbitSeconds: 3.6,
	breatheScale: 1.06,
} as const;

export type AiWaitMotionMode = "scan" | "static";

export type AiWaitMotionVars = {
	"--ai-wait-sweep": string;
	"--ai-wait-breathe": string;
	"--ai-wait-orbit": string;
	"--ai-wait-breathe-scale": string;
};

/** Reduced motion holds a calm static ring. Otherwise every wait uses one scan. */
export function aiWaitMotionMode(
	prefersReducedMotion: boolean,
): AiWaitMotionMode {
	return prefersReducedMotion ? "static" : "scan";
}

/** CSS variables so the stylesheet and the tested constants cannot drift. */
export function aiWaitMotionStyle(
	motion: typeof AI_WAIT_MOTION = AI_WAIT_MOTION,
): AiWaitMotionVars {
	return {
		"--ai-wait-sweep": `${motion.sweepSeconds}s`,
		"--ai-wait-breathe": `${motion.breatheSeconds}s`,
		"--ai-wait-orbit": `${motion.orbitSeconds}s`,
		"--ai-wait-breathe-scale": String(motion.breatheScale),
	};
}

/** One VoiceOver status line. Decorative motion is not part of it. */
export function aiWaitStatusLabel(
	title: string,
	detail: string,
	creditCost?: number | null,
): string {
	const headline = title.trim();
	const copy = detail.trim();
	let lead = headline;
	if (headline.length === 0) lead = copy;
	else if (copy.length > 0) lead = `${headline}. ${copy}`;
	if (creditCost == null) return lead;
	const pill = aiWaitCreditLabel(creditCost);
	if (lead.length === 0) return pill;
	return lead.endsWith(".") ? `${lead} ${pill}.` : `${lead}. ${pill}.`;
}

/** Credit pill. Callers pass null when that wait does not show a charge. */
export function aiWaitCreditLabel(creditCost: number): string {
	return `Uses ${creditCost} credit${creditCost === 1 ? "" : "s"}`;
}
