import { useEffect, useRef, useState } from "react";
import { isTypedConfirmMatch, useConfirm } from "~/lib/confirm-context";

const variantButtonClasses = {
	danger: "bg-danger text-white hover:bg-danger/90 shadow-glow-sm",
	warning: "bg-warning text-carbon hover:bg-warning/90 shadow-glow-sm",
	default: "bg-hyper-green text-carbon hover:shadow-glow shadow-glow-sm",
} as const;

export function ConfirmDialog() {
	const { pending, close } = useConfirm();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [typedValue, setTypedValue] = useState("");

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		if (pending) {
			setTypedValue("");
			dialog.showModal();
		} else {
			dialog.close();
		}
	}, [pending]);

	const handleCancel = () => {
		close(false);
	};

	const handleConfirm = () => {
		close(true);
	};

	const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
		if (e.target === e.currentTarget) {
			close(false);
		}
	};

	const handleCancelEvent = (e: React.SyntheticEvent<HTMLDialogElement>) => {
		e.preventDefault();
		close(false);
	};

	if (!pending) return null;

	const {
		title,
		message,
		confirmLabel,
		cancelLabel,
		variant,
		consequences,
		requireTyped,
	} = pending;
	const buttonClass = variantButtonClasses[variant ?? "default"];
	const isTypedGated = !!requireTyped;
	const isTypedMatch = isTypedConfirmMatch(requireTyped, typedValue);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled by onCancel; backdrop click has no keyboard equivalent
		<dialog
			ref={dialogRef}
			onCancel={handleCancelEvent}
			onClick={handleBackdropClick}
			className="p-0 border-0 bg-transparent max-w-[min(calc(100vw-2rem),28rem)] w-full max-h-[85vh] open:animate-fade-in [&::backdrop]:animate-fade-in backdrop:bg-carbon/30 backdrop:backdrop-blur-sm"
			aria-labelledby="confirm-dialog-title"
			aria-describedby="confirm-dialog-description"
		>
			<div className="fixed inset-x-0 bottom-0 w-full max-w-md p-0 rounded-t-2xl border border-platinum dark:border-white/10 bg-ceramic dark:bg-[#1A1A1A] shadow-xl overflow-y-auto max-h-[85vh] md:fixed md:inset-auto md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl">
				<div className="p-6 space-y-4">
					<h2
						id="confirm-dialog-title"
						className="text-xl font-bold text-carbon dark:text-white"
					>
						{title}
					</h2>
					<p id="confirm-dialog-description" className="text-sm text-muted">
						{message}
					</p>

					{consequences && consequences.length > 0 && (
						<div className="bg-danger/5 border border-danger/20 rounded-lg p-4 space-y-2">
							<p className="text-xs font-semibold text-danger uppercase tracking-wider">
								What will be permanently deleted
							</p>
							<ul className="space-y-1.5">
								{consequences.map((item) => (
									<li
										key={item}
										className="flex items-start gap-2 text-sm text-carbon dark:text-white/80"
									>
										<span className="mt-0.5 shrink-0 text-danger">—</span>
										<span>{item}</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{isTypedGated && (
						<div className="space-y-1.5">
							<label
								htmlFor="confirm-typed-input"
								className="text-xs font-medium text-muted"
							>
								Type{" "}
								<span className="font-mono font-semibold text-carbon dark:text-white">
									{requireTyped}
								</span>{" "}
								to confirm
							</label>
							<input
								id="confirm-typed-input"
								type="text"
								value={typedValue}
								onChange={(e) => setTypedValue(e.target.value)}
								autoComplete="off"
								autoCorrect="off"
								autoCapitalize="off"
								spellCheck={false}
								className="w-full px-3 py-2.5 text-sm bg-transparent border border-platinum dark:border-white/20 rounded-lg text-carbon dark:text-white placeholder:text-muted focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger transition-colors font-mono"
								placeholder={requireTyped}
							/>
						</div>
					)}
				</div>

				<div className="flex gap-3 justify-end px-6 pb-6">
					<button
						type="button"
						onClick={handleCancel}
						className="px-4 py-2.5 text-sm font-medium text-muted hover:text-carbon dark:hover:text-white border border-platinum dark:border-white/20 rounded-lg transition-colors"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={!isTypedMatch}
						className={`px-6 py-2.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${buttonClass}`}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</dialog>
	);
}
