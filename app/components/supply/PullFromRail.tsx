import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import {
	SavedListItemRow,
	type SavedRowItem,
} from "~/components/supply/SavedListItemRow";
import {
	pinnedListStorageKey,
	sortForPullFrom,
} from "~/lib/supply-saved-status";

type CatalogList = {
	id: string;
	name: string;
	state: string;
	createdFrom: string;
};

type ListPayload = {
	list?: {
		id: string;
		name: string;
		items: SavedRowItem[];
	};
};

export function PullFromRail({
	lists,
	organizationId,
	liveItemCount,
	open,
	onOpenChange,
}: {
	lists: CatalogList[];
	organizationId: string;
	liveItemCount: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const detail = useFetcher<ListPayload>();
	const addMissing = useFetcher();
	const revalidator = useRevalidator();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const wasBusy = useRef(false);

	useEffect(() => {
		const stored = window.localStorage.getItem(
			pinnedListStorageKey(organizationId),
		);
		const match = lists.find((list) => list.id === stored) ?? lists[0];
		setSelectedId(match?.id ?? null);
	}, [lists, organizationId]);

	useEffect(() => {
		if (!selectedId) return;
		detail.load(`/api/supply-lists/${selectedId}`);
	}, [selectedId, detail.load]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open) {
			if (!dialog.open) dialog.showModal();
		} else if (dialog.open) {
			dialog.close();
		}
	}, [open]);

	useEffect(() => {
		if (addMissing.state !== "idle") {
			wasBusy.current = true;
			return;
		}
		if (!wasBusy.current) return;
		wasBusy.current = false;
		revalidator.revalidate();
		if (selectedId) detail.load(`/api/supply-lists/${selectedId}`);
	}, [addMissing.state, detail.load, revalidator, selectedId]);

	const items = sortForPullFrom(detail.data?.list?.items ?? []);
	const selected = lists.find((list) => list.id === selectedId);

	const reload = () => {
		revalidator.revalidate();
		if (selectedId) detail.load(`/api/supply-lists/${selectedId}`);
	};

	const panel = (testId: string) => (
		<div className="flex h-full flex-col gap-3" data-testid={testId}>
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
					Pull from
				</h2>
				{selectedId ? (
					<button
						type="button"
						className="text-xs font-semibold text-hyper-green"
						onClick={() => {
							window.localStorage.setItem(
								pinnedListStorageKey(organizationId),
								selectedId,
							);
						}}
					>
						Pin to Live
					</button>
				) : null}
			</div>
			{lists.length === 0 ? (
				<p className="text-sm text-muted">
					Save a list, then pull items into Live while you shop.
				</p>
			) : (
				<>
					<label className="sr-only" htmlFor={`${testId}-list`}>
						Saved list
					</label>
					<select
						id={`${testId}-list`}
						className="min-h-11 rounded-lg border border-platinum bg-white px-3 text-sm font-semibold"
						value={selectedId ?? ""}
						onChange={(event) => setSelectedId(event.target.value)}
					>
						{lists.map((list) => (
							<option key={list.id} value={list.id}>
								{list.name}
							</option>
						))}
					</select>
					{liveItemCount === 0 && selected && items.length > 0 ? (
						<addMissing.Form
							method="post"
							action={`/hub/supply/lists/${selected.id}`}
						>
							<input type="hidden" name="intent" value="add-missing" />
							<button
								type="submit"
								className="min-h-11 w-full rounded-lg bg-hyper-green px-3 text-sm font-bold text-on-hyper-green"
							>
								Add missing from {selected.name}
							</button>
						</addMissing.Form>
					) : null}
					<ul className="max-h-[70vh] overflow-auto">
						{items.map((item) => (
							<SavedListItemRow
								key={`${testId}-${item.id}`}
								item={item}
								selecting={false}
								selected={false}
								readOnly
								formAction={
									selectedId ? `/hub/supply/lists/${selectedId}` : undefined
								}
								onToggleSelect={() => undefined}
								onDone={reload}
							/>
						))}
					</ul>
				</>
			)}
		</div>
	);

	return (
		<>
			<aside className="glass-panel sticky top-4 hidden h-fit rounded-2xl p-4 lg:block">
				{panel("pull-from-rail")}
			</aside>
			<dialog
				ref={dialogRef}
				className="fixed inset-x-0 bottom-0 z-40 m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-auto rounded-t-2xl border border-platinum bg-ceramic p-4 backdrop:bg-carbon/40 lg:hidden"
				onClose={() => onOpenChange(false)}
			>
				{panel("pull-from-sheet")}
				<button
					type="button"
					className="btn-secondary mt-3 min-h-11 w-full rounded-lg"
					onClick={() => onOpenChange(false)}
				>
					Close
				</button>
			</dialog>
		</>
	);
}
