import { Toast } from "~/components/shell/Toast";

export function AddToLiveToast({
	title,
	onUndo,
	onDismiss,
}: {
	title: string;
	onUndo?: () => void;
	onDismiss: () => void;
}) {
	return (
		<Toast
			variant="success"
			position="bottom-right"
			title={title}
			description={
				onUndo ? (
					<button
						type="button"
						className="mt-1 text-sm font-semibold text-white underline"
						onClick={onUndo}
					>
						Undo
					</button>
				) : undefined
			}
			onDismiss={onDismiss}
		/>
	);
}
