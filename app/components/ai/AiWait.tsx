import { Calendar, Camera, Flame, Link2, Sparkles } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import {
	type AiWaitMotionMode,
	aiWaitCreditLabel,
	aiWaitMotionMode,
	aiWaitMotionStyle,
	aiWaitStatusLabel,
} from "~/lib/ai-wait-motion";

export type AiWaitMark = "camera" | "fuel" | "sparkles" | "calendar" | "link";

const MARKS: Record<AiWaitMark, typeof Camera> = {
	camera: Camera,
	fuel: Flame,
	sparkles: Sparkles,
	calendar: Calendar,
	link: Link2,
};

function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const apply = () => setReduced(media.matches);
		apply();
		media.addEventListener("change", apply);
		return () => media.removeEventListener("change", apply);
	}, []);
	return reduced;
}

/**
 * Shared AI wait. The feature supplies the headline, one line, credit pill,
 * and center mark. The scan motion does not change between screens.
 */
export function AiWait({
	mark,
	title,
	detail,
	creditCost = null,
	titleId,
	detailId,
	statusId,
	className,
}: {
	mark: AiWaitMark;
	title: string;
	detail: string;
	creditCost?: number | null;
	titleId?: string;
	detailId?: string;
	statusId?: string;
	className?: string;
}) {
	const motion = aiWaitMotionMode(usePrefersReducedMotion());
	const status = aiWaitStatusLabel(title, detail, creditCost);
	const Icon = MARKS[mark];
	return (
		<div
			className={`ai-wait ${motion === "static" ? "is-static" : ""} ${className ?? ""}`}
			style={aiWaitMotionStyle() as CSSProperties}
			data-motion={motion}
		>
			<AiWaitStage
				icon={<Icon className="ai-wait-mark" strokeWidth={1.75} />}
			/>
			<div
				id={statusId}
				className="ai-wait-copy-block"
				role="status"
				aria-live="polite"
				aria-atomic="true"
				aria-label={status}
			>
				<h2 id={titleId} className="ai-wait-title" aria-hidden="true">
					{title}
				</h2>
				<p id={detailId} className="ai-wait-detail" aria-hidden="true">
					{detail}
				</p>
				{creditCost == null ? null : (
					<p className="ai-wait-pill" aria-hidden="true">
						{aiWaitCreditLabel(creditCost)}
					</p>
				)}
			</div>
			{motion === "scan" ? (
				<span className="ai-wait-spinner" aria-hidden="true" />
			) : null}
		</div>
	);
}

function AiWaitStage({ icon }: { icon: ReactNode }) {
	return (
		<div className="ai-wait-stage" aria-hidden="true">
			<svg className="ai-wait-ring" viewBox="0 0 112 112">
				<title>Scan ring</title>
				<circle
					cx="56"
					cy="56"
					r="44"
					fill="none"
					stroke="#00E088"
					strokeOpacity="0.28"
					strokeWidth="1"
				/>
			</svg>
			<svg className="ai-wait-sweep" viewBox="0 0 112 112">
				<title>Sweep</title>
				<circle
					cx="56"
					cy="56"
					r="44"
					fill="none"
					stroke="#00E088"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeDasharray="60 220"
				/>
			</svg>
			<svg className="ai-wait-orbit" viewBox="0 0 112 112">
				<title>Orbit</title>
				<circle
					cx="56"
					cy="56"
					r="52"
					fill="none"
					stroke="#00E088"
					strokeOpacity="0.55"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeDasharray="36 300"
				/>
			</svg>
			<svg className="ai-wait-reticle" viewBox="0 0 44 44">
				<title>Reticle</title>
				<path
					d="M8 16 V9 H16 M28 9 H36 V16 M36 28 V36 H28 M16 36 H8 V28"
					fill="none"
					stroke="#00E088"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
			{icon}
		</div>
	);
}

export type { AiWaitMotionMode };
