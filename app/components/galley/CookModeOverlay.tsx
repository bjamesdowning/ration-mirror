import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RecipeStep } from "~/lib/schemas/directions";

interface CookModeOverlayProps {
	steps: RecipeStep[];
	mealName: string;
	onClose: () => void;
}

export function CookModeOverlay({
	steps,
	mealName,
	onClose,
}: CookModeOverlayProps) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const wakeLockRef = useRef<WakeLockSentinel | null>(null);
	const touchStartX = useRef<number | null>(null);
	const touchStartY = useRef<number | null>(null);

	const total = steps.length;
	const current = steps[currentIndex];
	const progress = total > 1 ? ((currentIndex + 1) / total) * 100 : 100;

	// Screen Wake Lock — prevent display dim while cooking
	useEffect(() => {
		let active = true;

		const acquire = async () => {
			if (!("wakeLock" in navigator)) return;
			try {
				wakeLockRef.current = await navigator.wakeLock.request("screen");
			} catch {
				// Silently ignore — not critical
			}
		};

		acquire();

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible" && active) {
				acquire();
			}
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			active = false;
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			wakeLockRef.current?.release().catch(() => {});
		};
	}, []);

	const advance = () => {
		setCurrentIndex((i) => Math.min(i + 1, total - 1));
	};

	const back = () => {
		setCurrentIndex((i) => Math.max(i - 1, 0));
	};

	// Keyboard navigation — deps include stable setters + onClose + total
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "ArrowRight" || e.key === "ArrowDown")
				setCurrentIndex((i) => Math.min(i + 1, total - 1));
			if (e.key === "ArrowLeft" || e.key === "ArrowUp")
				setCurrentIndex((i) => Math.max(i - 1, 0));
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [total, onClose]);

	// Swipe detection
	const handleTouchStart = (e: React.TouchEvent) => {
		touchStartX.current = e.touches[0].clientX;
		touchStartY.current = e.touches[0].clientY;
	};

	const handleTouchEnd = (e: React.TouchEvent) => {
		if (touchStartX.current === null || touchStartY.current === null) return;
		const dx = e.changedTouches[0].clientX - touchStartX.current;
		const dy = e.changedTouches[0].clientY - touchStartY.current;
		// Only register horizontal swipes
		if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
			if (dx < 0) advance();
			else back();
		}
		touchStartX.current = null;
		touchStartY.current = null;
	};

	return (
		<div
			className="fixed inset-0 z-50 bg-ceramic flex flex-col select-none"
			onTouchStart={handleTouchStart}
			onTouchEnd={handleTouchEnd}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-5 safe-area-pt pt-4 pb-2 border-b border-platinum/60">
				<button
					type="button"
					onClick={onClose}
					aria-label="Exit cook mode"
					className="p-2 -ml-2 rounded-lg text-muted hover:text-carbon transition-colors"
				>
					<X size={20} />
				</button>

				<div className="flex flex-col items-center gap-0.5 max-w-[60%]">
					<span className="text-xs text-muted font-mono uppercase tracking-wider truncate w-full text-center">
						{mealName}
					</span>
					<span className="text-sm font-semibold text-carbon">
						Step {currentIndex + 1} of {total}
					</span>
				</div>

				{/* Spacer to balance the X button */}
				<div className="w-9" aria-hidden />
			</div>

			{/* Progress bar */}
			<div className="h-1 bg-platinum/60 w-full">
				<div
					className="h-full bg-hyper-green transition-all duration-300"
					style={{ width: `${progress}%` }}
				/>
			</div>

			{/* Step content */}
			<div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-hidden">
				{current?.section && (
					<div className="mb-6 px-3 py-1 rounded-full bg-platinum/60 text-muted text-xs uppercase tracking-widest font-mono">
						{current.section}
					</div>
				)}

				<div
					className="text-[64px] font-mono font-bold leading-none text-hyper-green mb-6 opacity-90"
					aria-hidden
				>
					{currentIndex + 1}
				</div>

				<p className="text-[22px] leading-[1.65] text-carbon text-center max-w-prose font-normal">
					{current?.text}
				</p>
			</div>

			{/* Navigation controls */}
			<div className="flex items-center justify-between px-4 safe-area-pb pb-6 pt-4 border-t border-platinum/60 gap-4">
				<button
					type="button"
					onClick={back}
					disabled={currentIndex === 0}
					aria-label="Previous step"
					className="flex items-center justify-center gap-2 flex-1 h-16 rounded-2xl bg-platinum/60 text-carbon font-semibold text-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-platinum active:scale-95 transition-all"
				>
					<ChevronLeft size={22} />
					Prev
				</button>

				{currentIndex < total - 1 ? (
					<button
						type="button"
						onClick={advance}
						aria-label="Next step"
						className="flex items-center justify-center gap-2 flex-1 h-16 rounded-2xl bg-hyper-green text-carbon font-bold text-lg hover:shadow-glow active:scale-95 transition-all"
					>
						Next
						<ChevronRight size={22} />
					</button>
				) : (
					<button
						type="button"
						onClick={onClose}
						aria-label="Finish cooking"
						className="flex items-center justify-center gap-2 flex-1 h-16 rounded-2xl bg-hyper-green text-carbon font-bold text-lg hover:shadow-glow active:scale-95 transition-all"
					>
						Done
					</button>
				)}
			</div>
		</div>
	);
}
