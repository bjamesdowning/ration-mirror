import { useEffect, useRef, useState } from "react";
import {
	Form,
	Link,
	redirect,
	useFetcher,
	useRevalidator,
	useSubmit,
} from "react-router";
import { EmptyPanel } from "~/components/hub/EmptyPanel";
import { ShoppingCartIcon } from "~/components/icons/PageIcons";
import { PageHeader } from "~/components/shell/PageHeader";
import { AddItemForm } from "~/components/supply/AddItemForm";
import { AddToLiveToast } from "~/components/supply/AddToLiveToast";
import { SavedListBulkBar } from "~/components/supply/SavedListBulkBar";
import { SavedListHeader } from "~/components/supply/SavedListHeader";
import {
	SavedListItemRow,
	type SavedRowItem,
} from "~/components/supply/SavedListItemRow";
import { requireActiveGroup } from "~/lib/auth.server";
import { useConfirm } from "~/lib/confirm-context";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import {
	deleteSupplyItem,
	deleteSupplyList,
	updateSupplyItem,
	updateSupplyList,
} from "~/lib/supply.server";
import { isSupplyMultiListsEnabled } from "~/lib/supply-list-flag.server";
import { resolveSupplyListState } from "~/lib/supply-list-kinds";
import {
	archiveSupplyList,
	copyItemsToLive,
	duplicateSupplyList,
	getSavedListView,
	undoAddToLive,
} from "~/lib/supply-lists.server";
import {
	type AddToLiveCounts,
	formatAddToLiveCounts,
	pinnedListStorageKey,
	previewAddToLive,
	reduceBulkSelection,
	sortForPullFrom,
} from "~/lib/supply-saved-status";
import type { Route } from "./+types/supply.lists.$id";

type UndoPayload = {
	added: Array<{ liveItemId: string }>;
	merged: Array<{
		liveItemId: string;
		prevQuantity: number;
		prevUnit: string;
		quantity?: number;
	}>;
};

type ActionOk = {
	toast?: string;
	result?: { counts: AddToLiveCounts };
	undo?: UndoPayload;
	error?: string;
};

async function gate(request: Request, context: Route.LoaderArgs["context"]) {
	const { groupId, session } = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;
	const enabled = await isSupplyMultiListsEnabled(
		env,
		buildWebFlagContext(request, env, session),
	);
	if (!enabled) throw redirect("/hub/supply");
	return { groupId, env };
}

function asUndo(value: unknown): UndoPayload {
	const record =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	const added = Array.isArray(record.added) ? record.added : [];
	const merged = Array.isArray(record.merged) ? record.merged : [];
	return {
		added: added.flatMap((row) => {
			if (!row || typeof row !== "object") return [];
			const liveItemId = (row as { liveItemId?: unknown }).liveItemId;
			return typeof liveItemId === "string" ? [{ liveItemId }] : [];
		}),
		merged: merged.flatMap((row) => {
			if (!row || typeof row !== "object") return [];
			const item = row as {
				liveItemId?: unknown;
				prevQuantity?: unknown;
				prevUnit?: unknown;
				quantity?: unknown;
			};
			if (typeof item.liveItemId !== "string") return [];
			if (typeof item.prevQuantity !== "number") return [];
			if (typeof item.prevUnit !== "string") return [];
			return [
				{
					liveItemId: item.liveItemId,
					prevQuantity: item.prevQuantity,
					prevUnit: item.prevUnit,
					quantity:
						typeof item.quantity === "number" ? item.quantity : undefined,
				},
			];
		}),
	};
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
	const { groupId, env } = await gate(request, context);
	const listId = params.id;
	if (!listId) throw redirect("/hub/supply/lists");
	const list = await getSavedListView(env, groupId, listId);
	if (!list) throw redirect("/hub/supply/lists");
	if (resolveSupplyListState(list) === "live") throw redirect("/hub/supply");
	return { list, organizationId: groupId };
}

export async function action({ request, params, context }: Route.ActionArgs) {
	const { groupId, env } = await gate(request, context);
	const listId = params.id;
	if (!listId) throw redirect("/hub/supply/lists");

	try {
		const formData = await request.formData();
		const intent = String(formData.get("intent") ?? "");
		const itemIds = formData
			.getAll("itemId")
			.map((value) => String(value))
			.filter(Boolean);

		if (
			intent === "add-one" ||
			intent === "add-missing" ||
			intent === "add-all" ||
			intent === "add-selected"
		) {
			if (intent === "add-selected" && itemIds.length === 0) {
				return { toast: "Select items first" };
			}
			const explicit = intent === "add-one" || intent === "add-selected";
			const copied = await copyItemsToLive({
				env,
				organizationId: groupId,
				sourceListId: listId,
				mode: intent === "add-missing" ? "missing_only" : "add_all",
				onExisting:
					formData.get("onExisting") === "add_more" ? "add_more" : "skip",
				itemIds: explicit ? itemIds : undefined,
			});
			return {
				result: copied.result,
				undo: {
					added: copied.result.added,
					merged: copied.result.merged,
				},
			} satisfies ActionOk;
		}

		if (intent === "undo") {
			let parsed: unknown = {};
			try {
				parsed = JSON.parse(String(formData.get("undo") ?? "{}"));
			} catch {
				parsed = {};
			}
			await undoAddToLive({
				env,
				organizationId: groupId,
				sourceListId: listId,
				...asUndo(parsed),
			});
			return { toast: "Undone" };
		}

		if (intent === "remove-from-live") {
			const liveItemId = String(formData.get("liveItemId") ?? "");
			if (!liveItemId) return { error: "Missing Live item" };
			await undoAddToLive({
				env,
				organizationId: groupId,
				sourceListId: listId,
				added: [{ liveItemId }],
				merged: [],
			});
			return { toast: "Removed from Live" };
		}

		if (intent === "edit-item") {
			const itemId = itemIds[0];
			if (!itemId) return { error: "Missing item" };
			const quantity = Number(formData.get("quantity"));
			await updateSupplyItem(env.DB, groupId, listId, itemId, {
				quantity: Number.isFinite(quantity) ? quantity : undefined,
				note: String(formData.get("note") ?? ""),
			});
			return { toast: "Saved" };
		}

		if (intent === "delete-item" || intent === "delete-items") {
			for (const itemId of itemIds) {
				await deleteSupplyItem(env.DB, groupId, listId, itemId);
			}
			return {
				toast: itemIds.length === 1 ? "Deleted" : `Deleted ${itemIds.length}`,
			};
		}

		if (intent === "rename") {
			const name = String(formData.get("name") ?? "").trim();
			if (!name) return { error: "Give the list a name." };
			await updateSupplyList(env.DB, groupId, listId, { name });
			return { toast: "Renamed" };
		}

		if (intent === "duplicate") {
			const list = await getSavedListView(env, groupId, listId);
			if (!list) throw redirect("/hub/supply/lists");
			const state = resolveSupplyListState(list);
			const copy = await duplicateSupplyList({
				env,
				organizationId: groupId,
				listId,
				kind: "saved",
				resetPurchased: state === "archived" || state === "template",
			});
			if (!copy) throw redirect("/hub/supply/lists");
			throw redirect(`/hub/supply/lists/${copy.id}`);
		}

		if (intent === "archive") {
			await archiveSupplyList(env.DB, groupId, listId);
			throw redirect("/hub/supply/lists");
		}

		if (intent === "delete-list") {
			await deleteSupplyList(env.DB, groupId, listId);
			throw redirect("/hub/supply/lists");
		}

		return { error: "Invalid intent" };
	} catch (error) {
		if (error instanceof Response) throw error;
		return handleApiError(error);
	}
}

export default function SavedSupplyListPage({
	loaderData,
}: Route.ComponentProps) {
	const { list, organizationId } = loaderData;
	const state = resolveSupplyListState(list);
	const archived = state === "archived";
	const receipt = list.createdFrom === "receipt";
	const sourceItems = (list.items ?? []) as SavedRowItem[];
	const items = receipt ? sortForPullFrom(sourceItems) : sourceItems;
	const missing = previewAddToLive(items, "missing");
	const bulkFetcher = useFetcher<ActionOk>();
	const submit = useSubmit();
	const revalidator = useRevalidator();
	const { confirm } = useConfirm();
	const [selection, setSelection] = useState({
		active: false,
		ids: [] as string[],
	});
	const [review, setReview] = useState<{
		intent: "add-missing" | "add-all" | "add-selected";
		adding: number;
		skippedOnLive: number;
		skippedInCart: number;
		skippedInCargo: number;
		ids: string[];
	} | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [undo, setUndo] = useState<UndoPayload | null>(null);
	const [pinned, setPinned] = useState(false);
	const wasBusy = useRef(false);
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		setPinned(
			window.localStorage.getItem(pinnedListStorageKey(organizationId)) ===
				list.id,
		);
	}, [list.id, organizationId]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (review) {
			if (!dialog.open) dialog.showModal();
		} else if (dialog.open) {
			dialog.close();
		}
	}, [review]);

	useEffect(() => {
		if (bulkFetcher.state !== "idle") {
			wasBusy.current = true;
			return;
		}
		if (!wasBusy.current) return;
		wasBusy.current = false;
		if (bulkFetcher.data?.result) {
			const message = formatAddToLiveCounts(bulkFetcher.data.result.counts);
			setToast(message || "Nothing new to add");
			setUndo(bulkFetcher.data.undo ?? null);
			setSelection({ active: false, ids: [] });
			setReview(null);
		} else if (bulkFetcher.data?.toast) {
			setToast(bulkFetcher.data.toast);
		} else if (bulkFetcher.data?.error) {
			setToast(bulkFetcher.data.error);
		}
	}, [bulkFetcher.state, bulkFetcher.data]);

	const submitAdd = (
		intent: "add-missing" | "add-all" | "add-selected",
		ids: string[] = [],
	) => {
		const body = new FormData();
		body.set("intent", intent);
		for (const id of ids) body.append("itemId", id);
		bulkFetcher.submit(body, { method: "post" });
	};

	const askOrAdd = (
		intent: "add-missing" | "add-all" | "add-selected",
		ids: string[] = [],
	) => {
		const mode =
			intent === "add-missing"
				? "missing"
				: intent === "add-all"
					? "all"
					: "selected";
		const preview = previewAddToLive(items, mode, ids);
		if (preview.needsReview) {
			setReview({
				intent,
				adding: preview.adding.length,
				skippedOnLive: preview.skippedOnLive,
				skippedInCart: preview.skippedInCart,
				skippedInCargo: preview.skippedInCargo,
				ids: preview.adding.map((item) => item.id),
			});
			return;
		}
		submitAdd(intent, intent === "add-selected" ? ids : []);
	};

	return (
		<div className="space-y-6 pb-36" data-testid="saved-list">
			<PageHeader
				icon={<ShoppingCartIcon className="w-6 h-6 text-carbon" />}
				title={list.name}
			/>
			<nav className="text-sm text-muted">
				<Link to="/hub/supply" className="font-semibold text-carbon">
					Supply
				</Link>
				<span> / </span>
				<Link to="/hub/supply/lists" className="font-semibold text-carbon">
					Lists
				</Link>
				<span> / {list.name}</span>
			</nav>
			<SavedListHeader
				name={list.name}
				createdFrom={list.createdFrom}
				itemCount={items.length}
				missingCount={missing.adding.length}
				readOnly={archived}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					className="min-h-11 rounded-lg bg-hyper-green px-3 text-sm font-bold text-on-hyper-green disabled:opacity-50"
					disabled={
						bulkFetcher.state !== "idle" ||
						(receipt ? items.length === 0 : missing.adding.length === 0)
					}
					onClick={() => askOrAdd(receipt ? "add-all" : "add-missing")}
				>
					{receipt
						? "Add all to Live"
						: `Add ${missing.adding.length} missing to Live`}
				</button>
				{archived ? null : (
					<button
						type="button"
						className="btn-secondary min-h-11 rounded-lg px-3 text-sm font-semibold"
						onClick={() =>
							setSelection((current) =>
								reduceBulkSelection(current, {
									type: current.active ? "cancel" : "start",
								}),
							)
						}
					>
						{selection.active ? "Cancel" : "Select"}
					</button>
				)}
				<Form method="post">
					<input type="hidden" name="intent" value="duplicate" />
					<button
						type="submit"
						className="btn-secondary min-h-11 rounded-lg px-3 text-sm font-semibold"
					>
						{archived ? "Restore as saved" : "Duplicate"}
					</button>
				</Form>
				<details className="relative">
					<summary className="btn-secondary flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-semibold">
						More
					</summary>
					<div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-platinum bg-ceramic p-2 shadow-lg">
						{archived ? null : (
							<button
								type="button"
								className="block w-full px-2 py-2 text-left text-sm font-semibold"
								onClick={() => {
									window.localStorage.setItem(
										pinnedListStorageKey(organizationId),
										list.id,
									);
									setPinned(true);
								}}
							>
								{pinned ? "Pinned to Live" : "Pin to Live"}
							</button>
						)}
						{state === "saved" ? (
							<Form method="post">
								<input type="hidden" name="intent" value="archive" />
								<button
									type="submit"
									className="block w-full px-2 py-2 text-left text-sm font-semibold"
								>
									Archive
								</button>
							</Form>
						) : null}
						<button
							type="button"
							className="block w-full px-2 py-2 text-left text-sm font-semibold text-danger"
							onClick={() => {
								void confirm({
									title: `Delete ${list.name}?`,
									message:
										"This removes the saved list. Live Supply stays as it is.",
									confirmLabel: "Delete",
									variant: "danger",
								}).then((ok) => {
									if (!ok) return;
									submit({ intent: "delete-list" }, { method: "post" });
								});
							}}
						>
							Delete
						</button>
					</div>
				</details>
			</div>

			{items.length === 0 ? (
				archived ? (
					<EmptyPanel
						icon={<ShoppingCartIcon className="w-12 h-12 text-muted" />}
						title="Empty history"
						description="This list has no items left to pull into Live."
					/>
				) : (
					<div className="space-y-4">
						<EmptyPanel
							icon={<ShoppingCartIcon className="w-12 h-12 text-muted" />}
							title="Nothing here yet"
							description="Add things you buy regularly. Pull them into Live when you plan a trip."
						/>
						<div className="glass-panel rounded-2xl p-4">
							<AddItemForm
								listId={list.id}
								onAdd={() => revalidator.revalidate()}
							/>
						</div>
					</div>
				)
			) : (
				<>
					{missing.adding.length === 0 ? (
						<div className="rounded-2xl border border-platinum p-4">
							<p className="text-sm text-carbon">
								Everything here is on Live or in Cargo.
							</p>
							<Link
								to="/hub/supply"
								className="mt-2 inline-flex text-sm font-semibold text-hyper-green"
							>
								Open Live
							</Link>
						</div>
					) : null}
					<ul>
						{items.map((item) => (
							<SavedListItemRow
								key={item.id}
								item={item}
								selecting={selection.active}
								selected={selection.ids.includes(item.id)}
								readOnly={archived}
								onToggleSelect={(id) =>
									setSelection((current) =>
										reduceBulkSelection(current, { type: "toggle", id }),
									)
								}
							/>
						))}
					</ul>
				</>
			)}

			{selection.active ? (
				<SavedListBulkBar
					count={selection.ids.length}
					canDelete={!archived}
					onCancel={() => setSelection({ active: false, ids: [] })}
					onAdd={() => askOrAdd("add-selected", selection.ids)}
					onDelete={() => {
						const body = new FormData();
						body.set("intent", "delete-items");
						for (const id of selection.ids) body.append("itemId", id);
						bulkFetcher.submit(body, { method: "post" });
					}}
				/>
			) : null}

			<dialog
				ref={dialogRef}
				className="w-full max-w-md rounded-2xl border border-platinum bg-ceramic p-4"
				onClose={() => setReview(null)}
			>
				{review ? (
					<>
						<h2 className="text-lg font-semibold text-carbon">Add to Live</h2>
						<p className="mt-2 text-sm text-muted">
							Adding {review.adding}
							{review.skippedOnLive
								? ` · ${review.skippedOnLive} already on Live`
								: ""}
							{review.skippedInCart ? ` · ${review.skippedInCart} in cart` : ""}
							{review.skippedInCargo
								? ` · ${review.skippedInCargo} in Cargo`
								: ""}
						</p>
						<div className="mt-4 flex gap-2">
							<button
								type="button"
								className="min-h-11 rounded-lg bg-hyper-green px-3 text-sm font-bold text-on-hyper-green"
								onClick={() => {
									const next = review;
									setReview(null);
									submitAdd(
										next.intent,
										next.intent === "add-selected" ? next.ids : [],
									);
								}}
							>
								Add {review.adding}
							</button>
							<button
								type="button"
								className="btn-secondary min-h-11 rounded-lg px-3 text-sm font-semibold"
								onClick={() => setReview(null)}
							>
								Cancel
							</button>
						</div>
					</>
				) : null}
			</dialog>

			{toast ? (
				<AddToLiveToast
					title={toast}
					onUndo={
						undo
							? () => {
									const body = new FormData();
									body.set("intent", "undo");
									body.set("undo", JSON.stringify(undo));
									setToast(null);
									setUndo(null);
									bulkFetcher.submit(body, { method: "post" });
								}
							: undefined
					}
					onDismiss={() => setToast(null)}
				/>
			) : null}
		</div>
	);
}
