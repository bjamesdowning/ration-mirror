import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { AddToLiveButton } from "~/components/supply/AddToLiveButton";
import { AddToLiveToast } from "~/components/supply/AddToLiveToast";
import {
	type AddToLiveCounts,
	formatAddToLiveCounts,
	formatSavedItemStatus,
} from "~/lib/supply-saved-status";

export type SavedRowItem = {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	note?: string | null;
	category?: string | null;
	inCargo?: number;
	lastDockedAt?: string | null;
	live?: {
		state: "none" | "on_live" | "in_cart";
		quantity?: number;
		unit?: string;
		manualOnly?: boolean;
		liveItemId?: string;
	};
};

export function SavedListItemRow({
	item,
	selecting,
	selected,
	readOnly,
	formAction,
	onToggleSelect,
	onDone,
}: {
	item: SavedRowItem;
	selecting: boolean;
	selected: boolean;
	readOnly: boolean;
	formAction?: string;
	onToggleSelect: (id: string) => void;
	onDone?: () => void;
}) {
	const fetcher = useFetcher<{
		toast?: string;
		result?: { counts: AddToLiveCounts };
		undo?: { added: unknown[]; merged: unknown[] };
	}>();
	const [menuOpen, setMenuOpen] = useState(false);
	const [toast, setToast] = useState<string | null>(null);
	const wasBusy = useRef(false);
	const onDoneRef = useRef(onDone);
	onDoneRef.current = onDone;
	const status = item.live?.state ?? "none";
	const statusLine = formatSavedItemStatus(item);
	const onLive = status === "on_live";
	const inCart = status === "in_cart";

	useEffect(() => {
		if (fetcher.state !== "idle") {
			wasBusy.current = true;
			return;
		}
		if (!wasBusy.current) return;
		wasBusy.current = false;
		if (fetcher.data?.result) {
			const single =
				fetcher.data.result.counts.added === 1 &&
				fetcher.data.result.counts.merged === 0
					? `Added ${item.name} to Live`
					: formatAddToLiveCounts(fetcher.data.result.counts);
			setToast(single || "Nothing new to add");
			setMenuOpen(false);
		} else if (fetcher.data?.toast) {
			setToast(fetcher.data.toast);
			setMenuOpen(false);
		}
		onDoneRef.current?.();
	}, [fetcher.state, fetcher.data, item.name]);

	return (
		<li className="flex items-start gap-3 border-b border-platinum/80 py-3 last:border-0">
			{selecting ? (
				<label className="flex h-11 w-11 shrink-0 items-center justify-center">
					<input
						type="checkbox"
						className="h-5 w-5"
						checked={selected}
						onChange={() => onToggleSelect(item.id)}
						aria-label={`Select ${item.name}`}
					/>
				</label>
			) : (
				<fetcher.Form method="post" action={formAction} className="shrink-0">
					<input type="hidden" name="intent" value="add-one" />
					<input type="hidden" name="itemId" value={item.id} />
					<input
						type="hidden"
						name="onExisting"
						value={onLive || inCart ? "add_more" : "skip"}
					/>
					<AddToLiveButton
						name={item.name}
						state={status}
						pending={fetcher.state !== "idle"}
						onClick={() => {
							if (onLive || inCart) setMenuOpen((open) => !open);
						}}
					/>
				</fetcher.Form>
			)}
			<div className="min-w-0 flex-1">
				<p className="font-semibold text-carbon">{item.name}</p>
				{statusLine ? (
					<p className="text-sm text-muted">{statusLine}</p>
				) : (
					<p className="text-sm text-muted">Not on Live</p>
				)}
				{menuOpen && !selecting ? (
					<div className="mt-2 flex flex-wrap gap-2">
						{(onLive || inCart) && (
							<fetcher.Form method="post" action={formAction}>
								<input type="hidden" name="intent" value="add-one" />
								<input type="hidden" name="itemId" value={item.id} />
								<input type="hidden" name="onExisting" value="add_more" />
								<button
									type="submit"
									className="text-sm font-semibold text-hyper-green"
								>
									Add more
								</button>
							</fetcher.Form>
						)}
						{onLive && item.live?.manualOnly && item.live.liveItemId ? (
							<fetcher.Form method="post" action={formAction}>
								<input type="hidden" name="intent" value="remove-from-live" />
								<input
									type="hidden"
									name="liveItemId"
									value={item.live.liveItemId}
								/>
								<button type="submit" className="text-sm font-semibold">
									Remove from Live
								</button>
							</fetcher.Form>
						) : null}
						<Link to="/hub/supply" className="text-sm font-semibold">
							Open in Live
						</Link>
					</div>
				) : null}
			</div>
			<div className="flex items-center gap-2">
				<span className="text-sm text-muted">
					{item.quantity} {item.unit}
				</span>
				{readOnly ? null : (
					<details className="relative">
						<summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-lg">
							<span className="sr-only">Item actions</span>⋯
						</summary>
						<div className="absolute right-0 z-10 w-40 rounded-xl border border-platinum bg-ceramic p-2 shadow-lg">
							<fetcher.Form
								method="post"
								action={formAction}
								className="space-y-2 p-1"
							>
								<input type="hidden" name="intent" value="edit-item" />
								<input type="hidden" name="itemId" value={item.id} />
								<label className="block text-xs text-muted">
									Quantity
									<input
										name="quantity"
										type="number"
										min="0"
										step="any"
										defaultValue={item.quantity}
										className="mt-1 w-full rounded-lg border border-platinum px-2 py-1"
									/>
								</label>
								<label className="block text-xs text-muted">
									Note
									<input
										name="note"
										defaultValue={item.note ?? ""}
										className="mt-1 w-full rounded-lg border border-platinum px-2 py-1"
									/>
								</label>
								<button
									type="submit"
									className="text-sm font-semibold text-hyper-green"
								>
									Save
								</button>
							</fetcher.Form>
							<fetcher.Form method="post" action={formAction}>
								<input type="hidden" name="intent" value="delete-item" />
								<input type="hidden" name="itemId" value={item.id} />
								<button
									type="submit"
									className="px-1 text-sm font-semibold text-danger"
								>
									Delete
								</button>
							</fetcher.Form>
						</div>
					</details>
				)}
			</div>
			{toast ? (
				<AddToLiveToast
					title={toast}
					onUndo={
						fetcher.data?.undo
							? () => {
									const payload = fetcher.data?.undo;
									if (!payload) return;
									const body = new FormData();
									body.set("intent", "undo");
									body.set("undo", JSON.stringify(payload));
									fetcher.submit(body, { method: "post", action: formAction });
									setToast(null);
								}
							: undefined
					}
					onDismiss={() => setToast(null)}
				/>
			) : null}
		</li>
	);
}
