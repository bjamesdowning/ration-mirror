import { type ReactNode, useEffect, useRef } from "react";

interface FilterSheetProps {
	/** Whether the sheet is currently open */
	isOpen: boolean;
	/** Callback when sheet should close */
	onClose: () => void;
	/** Sheet content */
	children: ReactNode;
	/** Optional title for the sheet */
	title?: string;
}

/**
 * FilterSheet - A bottom sheet component for mobile filter controls.
 * Slides up from the bottom of the screen when triggered.
 * Includes backdrop, drag-to-close capability, and smooth animations.
 *
 * Part of Option B: Unified Control Bar UI redesign.
 */
export function FilterSheet({
	isOpen,
	onClose,
	children,
	title,
}: FilterSheetProps) {
	const sheetRef = useRef<HTMLDivElement>(null);

	// Close on escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isOpen) {
				onClose();
			}
		};
		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [isOpen, onClose]);

	// Prevent body scroll when open
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<>
			{/* Backdrop */}
			<button
				type="button"
				tabIndex={-1}
				className="fixed inset-0 bg-carbon/40 backdrop-blur-sm z-40 animate-fade-in border-none cursor-default"
				onClick={onClose}
			/>

			{/* Sheet */}
			<div
				ref={sheetRef}
				className="fixed bottom-0 left-0 right-0 z-[70] bg-ceramic dark:bg-[#1A1A1A] rounded-t-3xl shadow-2xl animate-slide-up max-h-[85vh] overflow-hidden"
				style={{
					animation: "slideUp 0.3s ease-out forwards",
				}}
			>
				{/* Handle */}
				<div className="flex justify-center pt-3 pb-2">
					<div className="w-10 h-1 bg-platinum dark:bg-white/20 rounded-full" />
				</div>

				{/* Title */}
				{title && (
					<div className="px-6 pb-3 border-b border-platinum dark:border-white/10">
						<h3 className="text-lg font-bold text-carbon dark:text-white">
							{title}
						</h3>
					</div>
				)}

				{/* Content */}
				<div className="px-6 py-4 overflow-y-auto max-h-[calc(85vh-120px)]">
					{children}
				</div>

				{/* Safe area padding for iOS */}
				<div className="h-safe-area-inset-bottom" />
			</div>

			<style>{`
				@keyframes slideUp {
					from {
						transform: translateY(100%);
					}
					to {
						transform: translateY(0);
					}
				}
				@keyframes fadeIn {
					from {
						opacity: 0;
					}
					to {
						opacity: 1;
					}
				}
				.animate-slide-up {
					animation: slideUp 0.3s ease-out forwards;
				}
				.animate-fade-in {
					animation: fadeIn 0.2s ease-out forwards;
				}
			`}</style>
		</>
	);
}

/**
 * FilterChip - A pill-shaped toggle button for filter options.
 */
interface FilterChipProps {
	label: string;
	icon?: ReactNode;
	isActive: boolean;
	onClick: () => void;
}

export function FilterChip({
	label,
	icon,
	isActive,
	onClick,
}: FilterChipProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`
				flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all
				${
					isActive
						? "bg-hyper-green text-carbon"
						: "bg-platinum dark:bg-white/10 text-carbon dark:text-white/80 hover:bg-platinum/80 dark:hover:bg-white/20"
				}
			`}
		>
			{icon && <span className="w-4 h-4">{icon}</span>}
			{label}
		</button>
	);
}
