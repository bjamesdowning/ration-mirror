import type { ReactNode } from "react";

type ToastVariant = "info" | "success" | "error";
type ToastPosition = "top-right" | "bottom-right";

interface ToastProps {
	variant?: ToastVariant;
	position?: ToastPosition;
	title: string;
	description?: ReactNode;
	icon?: ReactNode;
	onDismiss?: () => void;
}

const positionClasses: Record<ToastPosition, string> = {
	"top-right": "fixed top-24 right-8 z-[60]",
	"bottom-right":
		"fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] md:bottom-8 right-8 z-[60]",
};

const variantClasses: Record<ToastVariant, string> = {
	info: "glass-panel rounded-xl p-4 shadow-xl border-l-4 border-hyper-green animate-slide-in-right",
	success:
		"bg-[#111111]/90 border border-hyper-green text-hyper-green px-6 py-4 rounded-xl shadow-2xl animate-slide-up",
	error:
		"glass-panel rounded-xl p-4 shadow-xl border-l-4 border-red-500 animate-slide-in-right",
};

export function Toast({
	variant = "info",
	position = "top-right",
	title,
	description,
	icon,
	onDismiss,
}: ToastProps) {
	const titleClass =
		variant === "success"
			? "font-bold text-white"
			: variant === "error"
				? "font-bold text-red-600 dark:text-red-400"
				: "font-bold text-carbon dark:text-white";
	const descriptionClass =
		variant === "success"
			? "text-sm text-gray-300"
			: variant === "error"
				? "text-sm text-red-500/80 dark:text-red-400/80"
				: "text-sm text-muted";
	const closeClass =
		variant === "success"
			? "text-white/70 hover:text-white"
			: variant === "error"
				? "text-red-400/70 hover:text-red-500"
				: "text-muted hover:text-carbon";

	return (
		<div className={`${positionClasses[position]} ${variantClasses[variant]}`}>
			<div className="flex items-start gap-3">
				{icon ? <div className="text-2xl">{icon}</div> : null}
				<div>
					<h4 className={`${titleClass} mb-1`}>{title}</h4>
					{description ? (
						<p className={descriptionClass}>{description}</p>
					) : null}
				</div>
				{onDismiss ? (
					<button
						type="button"
						onClick={onDismiss}
						className={closeClass}
						aria-label="Dismiss"
					>
						×
					</button>
				) : null}
			</div>
		</div>
	);
}
