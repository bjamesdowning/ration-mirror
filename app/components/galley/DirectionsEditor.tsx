import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseDirections, type RecipeStep } from "~/lib/schemas/directions";

interface DirectionsEditorProps {
	defaultValue?: RecipeStep[] | string;
	name?: string;
}

export function DirectionsEditor({
	defaultValue,
	name = "directions",
}: DirectionsEditorProps) {
	const [steps, setSteps] = useState<string[]>(() => {
		const parsed = parseDirections(
			defaultValue as RecipeStep[] | string | null | undefined,
		);
		return parsed.length > 0 ? parsed.map((s) => s.text) : [""];
	});

	const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

	// Auto-resize textareas whenever step count changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: inputRefs is a stable ref; steps length triggers resize
	useEffect(() => {
		for (const el of inputRefs.current) {
			if (el) {
				el.style.height = "auto";
				el.style.height = `${el.scrollHeight}px`;
			}
		}
	}, [steps.length]);

	const addStep = () => {
		setSteps((prev) => [...prev, ""]);
		// Focus new step after render
		setTimeout(() => {
			const last = inputRefs.current[inputRefs.current.length - 1];
			last?.focus();
		}, 0);
	};

	const removeStep = (index: number) => {
		setSteps((prev) => {
			if (prev.length <= 1) return [""];
			return prev.filter((_, i) => i !== index);
		});
	};

	const updateStep = (index: number, value: string) => {
		setSteps((prev) => {
			const next = [...prev];
			next[index] = value;
			return next;
		});
	};

	const moveStep = (index: number, direction: -1 | 1) => {
		setSteps((prev) => {
			const nextIndex = index + direction;
			if (nextIndex < 0 || nextIndex >= prev.length) return prev;
			const next = [...prev];
			[next[index], next[nextIndex]] = [next[nextIndex], next[index]];
			return next;
		});
		setTimeout(() => {
			inputRefs.current[index + direction]?.focus();
		}, 0);
	};

	// Drag state
	const dragIndex = useRef<number | null>(null);

	const handleDragStart = (index: number) => {
		dragIndex.current = index;
	};

	const handleDragOver = (e: React.DragEvent<HTMLLIElement>, index: number) => {
		e.preventDefault();
		if (dragIndex.current === null || dragIndex.current === index) return;
		setSteps((prev) => {
			const next = [...prev];
			const fromIndex = dragIndex.current;
			if (fromIndex === null) return prev;
			const [moved] = next.splice(fromIndex, 1);
			next.splice(index, 0, moved);
			dragIndex.current = index;
			return next;
		});
	};

	const handleDragEnd = () => {
		dragIndex.current = null;
	};

	// Serialized canonical JSON for form submission
	const serialized = JSON.stringify(
		steps
			.map((text) => text.trim())
			.filter((text) => text.length > 0)
			.map((text, i) => ({ position: i + 1, text })),
	);

	return (
		<div className="glass-panel rounded-xl p-4 flex flex-col gap-3">
			<p className="text-label text-muted text-sm">Directions</p>

			<input type="hidden" name={name} value={serialized} />

			<ol className="flex flex-col gap-2">
				{steps.map((step, index) => (
					<li
						key={`step-${
							// biome-ignore lint/suspicious/noArrayIndexKey: stable ordered list
							index
						}`}
						className="flex items-start gap-2 group"
						draggable
						onDragStart={() => handleDragStart(index)}
						onDragOver={(e) => handleDragOver(e, index)}
						onDragEnd={handleDragEnd}
					>
						{/* Drag handle */}
						<button
							type="button"
							aria-label="Drag to reorder"
							className="mt-2 text-muted opacity-60 md:opacity-40 md:group-hover:opacity-80 cursor-grab active:cursor-grabbing shrink-0"
						>
							<GripVertical size={16} />
						</button>

						{/* Step number */}
						<span className="mt-2 text-hyper-green font-mono text-sm w-5 shrink-0 select-none">
							{index + 1}
						</span>

						{/* Step text */}
						<textarea
							ref={(el) => {
								inputRefs.current[index] = el;
							}}
							value={step}
							onChange={(e) => {
								updateStep(index, e.target.value);
								e.currentTarget.style.height = "auto";
								e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									addStep();
								}
								if (e.key === "Backspace" && step === "" && steps.length > 1) {
									e.preventDefault();
									removeStep(index);
									setTimeout(() => {
										inputRefs.current[Math.max(0, index - 1)]?.focus();
									}, 0);
								}
							}}
							rows={1}
							className="flex-1 bg-platinum rounded-lg text-carbon text-sm p-2 placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none resize-none overflow-hidden leading-relaxed"
							placeholder={
								index === 0
									? "First step — what happens at the start?"
									: "Next step..."
							}
						/>

						{/* Mobile-only reorder controls */}
						<div className="flex flex-col gap-0.5 md:hidden shrink-0 mt-1">
							<button
								type="button"
								onClick={() => moveStep(index, -1)}
								aria-label={`Move step ${index + 1} up`}
								className="w-7 h-7 flex items-center justify-center text-muted hover:text-carbon transition-colors disabled:opacity-30"
								disabled={index === 0}
							>
								▲
							</button>
							<button
								type="button"
								onClick={() => moveStep(index, 1)}
								aria-label={`Move step ${index + 1} down`}
								className="w-7 h-7 flex items-center justify-center text-muted hover:text-carbon transition-colors disabled:opacity-30"
								disabled={index === steps.length - 1}
							>
								▼
							</button>
						</div>

						{/* Remove button */}
						<button
							type="button"
							onClick={() => removeStep(index)}
							aria-label={`Remove step ${index + 1}`}
							className="mt-2 text-muted opacity-60 md:opacity-0 md:group-hover:opacity-60 hover:!opacity-100 hover:text-red-500 transition-opacity shrink-0"
						>
							<Trash2 size={14} />
						</button>
					</li>
				))}
			</ol>

			<button
				type="button"
				onClick={addStep}
				className="flex items-center gap-2 text-sm text-muted hover:text-hyper-green transition-colors mt-1 self-start"
			>
				<Plus size={14} />
				Add step
			</button>
		</div>
	);
}
