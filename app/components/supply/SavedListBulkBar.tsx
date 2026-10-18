export function SavedListBulkBar({
	count,
	onAdd,
	onDelete,
	onCancel,
	canDelete,
}: {
	count: number;
	onAdd: () => void;
	onDelete?: () => void;
	onCancel: () => void;
	canDelete: boolean;
}) {
	return (
		<div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-platinum bg-ceramic/95 p-3 shadow-lg">
			<p className="text-sm font-semibold text-carbon">{count} selected</p>
			<button
				type="button"
				className="min-h-11 rounded-lg bg-hyper-green px-3 text-sm font-bold text-on-hyper-green"
				disabled={count === 0}
				onClick={onAdd}
			>
				Add {count} to Live
			</button>
			{canDelete ? (
				<button
					type="button"
					className="min-h-11 rounded-lg px-3 text-sm font-semibold text-danger"
					disabled={count === 0}
					onClick={onDelete}
				>
					Delete {count}
				</button>
			) : null}
			<button
				type="button"
				className="min-h-11 rounded-lg px-3 text-sm font-semibold btn-secondary"
				onClick={onCancel}
			>
				Cancel
			</button>
		</div>
	);
}
