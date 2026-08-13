import { Play, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { lockBodyScroll } from "~/lib/body-scroll-lock";
import { EXPLAINER_VIDEO_EMBED_URL } from "~/lib/marketing";

export function ExplainerVideoDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const wasOpenRef = useRef(false);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open) {
			wasOpenRef.current = true;
			if (!dialog.open) dialog.showModal();
			return;
		}
		if (dialog.open) dialog.close();
		if (wasOpenRef.current) {
			wasOpenRef.current = false;
			document.getElementById("splash-tour-trigger")?.focus();
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;
		return lockBodyScroll();
	}, [open]);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled by the dialog cancel event; backdrop click has no keyboard equivalent
		<dialog
			ref={dialogRef}
			className="splash-tour-dialog"
			aria-labelledby="splash-tour-title"
			onClose={onClose}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className="splash-tour-panel">
				<div className="splash-tour-toolbar">
					<p id="splash-tour-title">Watch the 90-second tour</p>
					<button
						type="button"
						className="splash-tour-close"
						onClick={onClose}
						aria-label="Close explainer video"
					>
						<X size={18} />
					</button>
				</div>
				<div className="splash-tour-frame">
					{open ? (
						<iframe
							src={EXPLAINER_VIDEO_EMBED_URL}
							title="Ration explainer video"
							allow="autoplay; encrypted-media; picture-in-picture"
							allowFullScreen
						/>
					) : null}
				</div>
			</div>
		</dialog>
	);
}

export function ExplainerTourButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			id="splash-tour-trigger"
			type="button"
			className="splash-tour-link"
			onClick={onClick}
			aria-label="Play the Ration explainer video"
		>
			<span className="splash-tour-play" aria-hidden>
				<Play size={11} fill="currentColor" />
			</span>
			Watch the 90-second tour
		</button>
	);
}
