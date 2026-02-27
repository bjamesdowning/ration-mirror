import { Check, ChefHat } from "lucide-react";
import { useState } from "react";
import type { RecipeStep } from "~/lib/schemas/directions";
import { CookModeOverlay } from "./CookModeOverlay";

interface DirectionsStepsProps {
	steps: RecipeStep[];
	mealName: string;
}

export function DirectionsSteps({ steps, mealName }: DirectionsStepsProps) {
	const [completed, setCompleted] = useState<Set<number>>(new Set());
	const [cookMode, setCookMode] = useState(false);

	if (steps.length === 0) {
		return (
			<p className="text-muted italic bg-platinum/30 rounded-xl p-6">
				No directions provided
			</p>
		);
	}

	const toggleStep = (position: number) => {
		setCompleted((prev) => {
			const next = new Set(prev);
			if (next.has(position)) next.delete(position);
			else next.add(position);
			return next;
		});
	};

	// Group steps by section to render section dividers
	const sections: { label: string | undefined; steps: RecipeStep[] }[] = [];
	for (const step of steps) {
		const last = sections[sections.length - 1];
		if (!last || last.label !== step.section) {
			sections.push({ label: step.section, steps: [step] });
		} else {
			last.steps.push(step);
		}
	}

	const doneCount = completed.size;
	const allDone = doneCount === steps.length;

	return (
		<>
			{cookMode && (
				<CookModeOverlay
					steps={steps}
					mealName={mealName}
					onClose={() => setCookMode(false)}
				/>
			)}

			<div className="flex flex-col gap-4">
				{/* Cook Mode launch + progress summary */}
				<div className="flex items-center justify-between gap-4 flex-wrap">
					{doneCount > 0 && (
						<span className="text-xs text-muted font-mono">
							{doneCount}/{steps.length} steps done
						</span>
					)}
					<button
						type="button"
						onClick={() => setCookMode(true)}
						className="ml-auto flex items-center gap-2 text-sm font-semibold bg-hyper-green text-carbon px-4 py-2 rounded-xl hover:shadow-glow-sm active:scale-95 transition-all"
					>
						<ChefHat size={15} />
						Cook Mode
					</button>
				</div>

				{/* Step cards */}
				{sections.map((section) => (
					<div key={section.label ?? "__root__"}>
						{section.label && (
							<div className="mb-3 flex items-center gap-3">
								<span className="text-xs uppercase tracking-widest font-mono text-muted px-3 py-1 rounded-full bg-platinum/60">
									{section.label}
								</span>
								<div className="flex-1 h-px bg-platinum/60" />
							</div>
						)}

						<ol className="flex flex-col gap-3">
							{section.steps.map((step) => {
								const done = completed.has(step.position);
								return (
									<li key={step.position}>
										<button
											type="button"
											onClick={() => toggleStep(step.position)}
											className={`w-full text-left flex items-start gap-4 bg-platinum/30 rounded-xl p-5 transition-all hover:bg-platinum/50 active:scale-[0.99] ${done ? "opacity-50" : ""}`}
											aria-pressed={done}
											aria-label={`Step ${step.position}: ${done ? "Mark incomplete" : "Mark complete"}`}
										>
											{/* Step number / checkmark */}
											<div
												className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all mt-0.5 ${
													done
														? "bg-hyper-green text-carbon"
														: "border-2 border-hyper-green/60"
												}`}
											>
												{done ? (
													<Check size={14} strokeWidth={3} />
												) : (
													<span className="font-mono text-xs font-bold text-hyper-green">
														{step.position}
													</span>
												)}
											</div>

											{/* Step text */}
											<p
												className={`text-base leading-relaxed text-carbon ${done ? "line-through decoration-carbon/40" : ""}`}
											>
												{step.text}
											</p>
										</button>
									</li>
								);
							})}
						</ol>
					</div>
				))}

				{/* All done state */}
				{allDone && (
					<div className="flex items-center justify-center gap-2 py-3 text-hyper-green text-sm font-semibold font-mono">
						<Check size={16} strokeWidth={3} />
						All steps complete
					</div>
				)}
			</div>
		</>
	);
}
