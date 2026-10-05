import { useFetcher } from "react-router";

export function SupplyLibraryActions({
	listId,
	state,
	atCapacity,
}: {
	listId: string;
	state: string;
	atCapacity: boolean;
}) {
	const fetcher = useFetcher();
	const busy = fetcher.state !== "idle";
	const jsonPost = (action: string, body: Record<string, unknown> = {}) => {
		fetcher.submit(JSON.stringify(body), {
			method: "POST",
			action,
			encType: "application/json",
		});
	};

	return (
		<fieldset className="flex flex-wrap gap-2 border-0 p-0">
			<legend className="sr-only">List actions</legend>
			{state !== "live" && (
				<button
					type="button"
					className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
					disabled={busy || atCapacity}
					onClick={() =>
						jsonPost(`/api/supply-lists/${listId}/duplicate`, {
							kind: "saved",
							resetPurchased: state === "archived" || state === "template",
						})
					}
				>
					{state === "archived" ? "Reorder this trip" : "Duplicate"}
				</button>
			)}
			{state === "saved" && (
				<>
					<button
						type="button"
						className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
						disabled={busy || atCapacity}
						onClick={() =>
							jsonPost(`/api/supply-lists/${listId}/duplicate`, {
								kind: "template",
							})
						}
					>
						Save as template
					</button>
					<button
						type="button"
						className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
						disabled={busy}
						onClick={() => jsonPost(`/api/supply-lists/${listId}/archive`)}
					>
						Archive
					</button>
				</>
			)}
			{(state === "live" || state === "saved") && (
				<>
					<button
						type="button"
						className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
						disabled={busy}
						onClick={() =>
							jsonPost(`/api/supply-lists/${listId}/reset-purchased`)
						}
					>
						Reset purchased
					</button>
					{state === "saved" && (
						<button
							type="button"
							className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
							disabled={busy}
							onClick={() =>
								jsonPost(`/api/supply-lists/${listId}/copy-to-live`, {
									mode: "missing_only",
								})
							}
						>
							Add missing to Live
						</button>
					)}
				</>
			)}
			{state === "template" && (
				<button
					type="button"
					className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
					disabled={busy || atCapacity}
					onClick={() =>
						jsonPost(`/api/supply-lists/${listId}/duplicate`, {
							kind: "saved",
							resetPurchased: true,
						})
					}
				>
					New from template
				</button>
			)}
		</fieldset>
	);
}
