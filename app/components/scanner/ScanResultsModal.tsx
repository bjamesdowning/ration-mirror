import { AlertTriangle, Calendar, Check, Edit2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useRouteLoaderData } from "react-router";
import { UpgradePrompt } from "~/components/shell/UpgradePrompt";
import { DOMAIN_LABELS, type ITEM_DOMAINS } from "~/lib/domain";
import { normalizeForMatch, tokenMatchScore } from "~/lib/matching";
import { projectNutritionSnapshotToLegacy } from "~/lib/nutrition/adapters";
import { provenanceLabel } from "~/lib/nutrition/panel-helpers";
import {
	fetchNutritionResolveChunk,
	type NutritionLookupStatus,
	resolveNutritionInChunks,
	shouldReresolveNutritionAfterNameChange,
} from "~/lib/nutrition/scan-review-resolve";
import type { AnyNutritionSnapshot } from "~/lib/nutrition/types";
import {
	areIngredientUnitsCompatible,
	convertForIngredient,
} from "~/lib/present-quantity";
import type { ScanResult, ScanResultItem } from "~/lib/schemas/scan";
import { DockItemFields } from "./DockItemFields";
import {
	NutritionKcalHint,
	NutritionLookupBanner,
} from "./NutritionLookupStatus";

type ItemDomain = (typeof ITEM_DOMAINS)[number];

interface ExistingInventoryItem {
	id: string;
	name: string;
	quantity: number;
	unit: string;
}

interface MergeMatch {
	target: ExistingInventoryItem;
	convertedQuantity: number;
	displayDelta: string;
}

import { presentQuantity } from "~/lib/present-quantity";

interface ScanResultsModalProps {
	result: ScanResult;
	existingInventory?: ExistingInventoryItem[];
	onClose: () => void;
	onSuccess: () => void;
}

export function ScanResultsModal({
	result,
	existingInventory = [],
	onClose,
	onSuccess,
}: ScanResultsModalProps) {
	const fetcher = useFetcher();
	const [items, setItems] = useState<ScanResultItem[]>(result.items);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [bulkEditMode, setBulkEditMode] = useState(false);
	const [bulkExpiryDate, setBulkExpiryDate] = useState("");
	const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
	const [dismissedMerges, setDismissedMerges] = useState<Set<string>>(
		new Set(),
	);
	const rootData = useRouteLoaderData("root") as
		| {
				clientFlags?: {
					nutritionEngine?: boolean;
					nutritionAiEstimate?: boolean;
				};
		  }
		| undefined;
	const nutritionEngine = rootData?.clientFlags?.nutritionEngine === true;
	const nutritionAiEstimate =
		rootData?.clientFlags?.nutritionAiEstimate === true;
	const isAiIngestSource =
		result.metadata.source === "image" || result.metadata.source === "pdf";
	const allowAiNutritionEstimate = isAiIngestSource && nutritionAiEstimate;
	const [nutritionLookupStatus, setNutritionLookupStatus] =
		useState<NutritionLookupStatus>(nutritionEngine ? "loading" : "idle");

	const dismissMerge = (id: string) =>
		setDismissedMerges((prev) => new Set(prev).add(id));

	const selectedItems = items.filter((item) => item.selected);
	const isSubmitting = fetcher.state !== "idle";

	// Toggle selection
	const toggleSelection = (id: string) => {
		setItems((prev) =>
			prev.map((item) =>
				item.id === id ? { ...item, selected: !item.selected } : item,
			),
		);
	};

	// Toggle all
	const toggleAll = () => {
		const allSelected = items.every((item) => item.selected);
		setItems((prev) =>
			prev.map((item) => ({ ...item, selected: !allSelected })),
		);
	};

	// Update item
	const updateItem = (id: string, updates: Partial<ScanResultItem>) => {
		setItems((prev) =>
			prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
		);
	};

	/** Clear + re-resolve nutrition for one row after a rename (by id). */
	const reresolveItemNutrition = useCallback(
		async (itemId: string, name: string) => {
			if (!nutritionEngine) return;
			const trimmed = name.trim();
			if (!trimmed) return;

			setNutritionLookupStatus("loading");
			try {
				const result = await fetchNutritionResolveChunk([trimmed], {
					ingestSource: allowAiNutritionEstimate ? "scan_review" : undefined,
				});
				if (!result.ok) {
					setNutritionLookupStatus("failed");
					setItems((prev) =>
						prev.map((item) =>
							item.id === itemId ? { ...item, nutrition: null } : item,
						),
					);
					return;
				}
				const snap = result.snapshots[trimmed] as
					| AnyNutritionSnapshot
					| null
					| undefined;
				setItems((prev) =>
					prev.map((item) => {
						if (item.id !== itemId) return item;
						if (snap === undefined) {
							return { ...item, nutrition: null };
						}
						return {
							...item,
							nutrition: snap ? projectNutritionSnapshotToLegacy(snap) : null,
						};
					}),
				);
				setNutritionLookupStatus("done");
			} catch {
				setNutritionLookupStatus("failed");
				setItems((prev) =>
					prev.map((item) =>
						item.id === itemId ? { ...item, nutrition: null } : item,
					),
				);
			}
		},
		[nutritionEngine, allowAiNutritionEstimate],
	);

	// Apply bulk expiry date
	const applyBulkExpiry = () => {
		if (!bulkExpiryDate) return;
		setItems((prev) =>
			prev.map((item) =>
				item.selected ? { ...item, expiresAt: bulkExpiryDate } : item,
			),
		);
		setBulkEditMode(false);
		setBulkExpiryDate("");
	};

	const findMergeMatch = useCallback(
		(item: ScanResultItem): MergeMatch | null => {
			if (!existingInventory.length) return null;
			const normalizedItem = normalizeForMatch(item.name);
			let bestMatch: MergeMatch | null = null;
			let bestScore = 0;

			for (const candidate of existingInventory) {
				if (
					!areIngredientUnitsCompatible(item.unit, candidate.unit, item.name)
				) {
					continue;
				}
				const normalizedCandidate = normalizeForMatch(candidate.name);

				const exact = normalizedItem === normalizedCandidate;
				const score = exact ? 1 : tokenMatchScore(item.name, candidate.name);

				if (score >= 0.8 && score > bestScore) {
					bestScore = score;
					const convertedQuantity =
						convertForIngredient(
							item.quantity,
							item.unit,
							candidate.unit,
							item.name,
						) ?? item.quantity;
					bestMatch = {
						target: candidate,
						convertedQuantity,
						displayDelta: `+${
							presentQuantity({
								quantity: convertedQuantity,
								unit: candidate.unit,
								ingredientName: item.name,
								mode: "original",
							}).formatted
						}`,
					};
				}
			}

			return bestMatch;
		},
		[existingInventory],
	);

	const mergeMatches = useMemo(() => {
		const map = new Map<string, MergeMatch>();
		for (const item of items) {
			if (dismissedMerges.has(item.id)) continue;
			const match = findMergeMatch(item);
			if (match) map.set(item.id, match);
		}
		return map;
	}, [items, findMergeMatch, dismissedMerges]);

	// Propose nutrition snapshots after scan results load (nutrition-engine).
	// Chunked so large receipts paint kcal progressively while the user reviews.
	useEffect(() => {
		if (!nutritionEngine) {
			setNutritionLookupStatus("idle");
			return;
		}
		const names = result.items.map((i) => i.name);
		if (names.every((n) => !n.trim())) {
			setNutritionLookupStatus("done");
			return;
		}

		const controller = new AbortController();
		setNutritionLookupStatus("loading");
		void (async () => {
			const status = await resolveNutritionInChunks({
				names,
				ingestSource: allowAiNutritionEstimate ? "scan_review" : undefined,
				signal: controller.signal,
				fetchChunk: (chunk, signal) =>
					fetchNutritionResolveChunk(chunk, {
						ingestSource: allowAiNutritionEstimate ? "scan_review" : undefined,
						signal,
					}),
				onChunk: (snapshots) => {
					setItems((prev) =>
						prev.map((item) => {
							const key = item.name.trim();
							const snap = snapshots[key] as
								| AnyNutritionSnapshot
								| null
								| undefined;
							if (snap === undefined) return item;
							return {
								...item,
								nutrition: snap ? projectNutritionSnapshotToLegacy(snap) : null,
							};
						}),
					);
				},
			});
			if (!controller.signal.aborted) {
				setNutritionLookupStatus(status);
			}
		})();

		return () => {
			controller.abort();
		};
	}, [nutritionEngine, allowAiNutritionEstimate, result.items]);

	// Handle submit
	const handleSubmit = () => {
		const itemsToAdd = selectedItems.map((item) => {
			const mergeMatch = mergeMatches.get(item.id);
			return {
				name: item.name,
				quantity: mergeMatch ? mergeMatch.convertedQuantity : item.quantity,
				unit: mergeMatch ? mergeMatch.target.unit : item.unit,
				domain: item.domain,
				tags: item.tags,
				expiresAt: item.expiresAt,
				mergeTargetId: mergeMatch?.target.id,
				...(item.nutrition != null ? { nutrition: item.nutrition } : {}),
			};
		});

		const batchBody = JSON.stringify({
			items: itemsToAdd,
			...(allowAiNutritionEstimate ? { ingestSource: "scan_review" } : {}),
		});
		fetcher.submit(batchBody, {
			method: "POST",
			action: "/api/cargo/batch",
			encType: "application/json",
		});
	};

	// Handle success — only close when all items were added; stay open on capacity_exceeded
	const batchResponse = fetcher.data as
		| {
				success: boolean;
				added?: number;
				updated?: number;
				total?: number;
				errors?: Array<{ name: string; error: string }>;
				error?: "capacity_exceeded";
				canAdd?: number;
		  }
		| undefined;
	const hasCapacityError =
		batchResponse?.error === "capacity_exceeded" ||
		batchResponse?.errors?.some((e) => e.error === "capacity_exceeded");
	const allSucceeded =
		batchResponse?.success &&
		!hasCapacityError &&
		(batchResponse.added ?? 0) + (batchResponse.updated ?? 0) ===
			(batchResponse.total ?? 0);

	useEffect(() => {
		if (fetcher.state !== "idle" || !batchResponse?.success) return;
		if (allSucceeded) {
			onSuccess();
			onClose();
		}
	}, [fetcher.state, batchResponse?.success, allSucceeded, onSuccess, onClose]);

	return (
		<>
			<div className="fixed inset-0 z-[60] flex items-center justify-center p-4 modal-scrim-heavy">
				<div className="bg-ceramic dark:bg-[#1A1A1A] border-2 border-hyper-green rounded-xl shadow-glow w-full md:max-w-4xl max-h-[90vh] md:max-h-[85vh] overflow-hidden flex flex-col">
					{/* Header */}
					<div className="flex items-center justify-between p-6 border-b border-hyper-green/30">
						<div>
							<h2 className="text-2xl font-bold text-hyper-green">
								Scan Results
							</h2>
							<p className="text-sm text-muted mt-1">
								{items.length} items detected • {selectedItems.length} selected
							</p>
							<p className="text-xs text-muted mt-0.5">
								Tap edit to fix names, quantities, or units
							</p>
							{nutritionEngine ? (
								<div className="mt-1">
									<NutritionLookupBanner status={nutritionLookupStatus} />
								</div>
							) : null}
						</div>
						<button
							type="button"
							onClick={onClose}
							className="text-muted hover:text-hyper-green transition-colors"
							aria-label="Close modal"
						>
							<X className="w-6 h-6" />
						</button>
					</div>

					{/* truncationWarning: set when CSV import hit row limit (e.g. 500); see ScanResultSchema */}
					{result.metadata?.truncationWarning && (
						<div className="mx-4 mt-4 p-4 bg-platinum/20 dark:bg-white/10 border border-platinum dark:border-white/20 rounded-xl text-sm text-muted">
							{result.metadata.truncationWarning}
						</div>
					)}

					{/* Bulk Controls */}
					<div className="p-4 border-b border-hyper-green/30 bg-platinum/30 dark:bg-white/5">
						<div className="flex flex-wrap gap-3 items-center">
							<button
								type="button"
								onClick={toggleAll}
								className="px-4 py-2 bg-platinum/10 hover:bg-platinum/20 text-sm text-muted hover:text-hyper-green rounded-lg transition-colors font-medium"
							>
								{items.every((item) => item.selected)
									? "Deselect All"
									: "Select All"}
							</button>

							<button
								type="button"
								onClick={() => setBulkEditMode(!bulkEditMode)}
								disabled={selectedItems.length === 0}
								className="px-4 py-2 bg-platinum/10 hover:bg-platinum/20 text-sm text-muted hover:text-hyper-green rounded-lg transition-colors font-medium disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
							>
								<Calendar className="w-4 h-4" />
								Set Expiry Date
							</button>

							{bulkEditMode && (
								<div className="flex items-center gap-2 flex-1">
									<input
										type="date"
										value={bulkExpiryDate}
										onChange={(e) => setBulkExpiryDate(e.target.value)}
										className="bg-platinum/10 border border-hyper-green/30 rounded-lg px-3 py-2 text-sm text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
									/>
									<button
										type="button"
										onClick={applyBulkExpiry}
										disabled={!bulkExpiryDate}
										className="px-4 py-2 bg-hyper-green text-on-hyper-green font-semibold rounded-lg hover:bg-hyper-green/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
									>
										Apply to Selected
									</button>
									<button
										type="button"
										onClick={() => {
											setBulkEditMode(false);
											setBulkExpiryDate("");
										}}
										className="px-4 py-2 text-sm text-muted hover:text-hyper-green"
									>
										Cancel
									</button>
								</div>
							)}
						</div>
					</div>

					{/* Capacity exceeded banner — all-or-nothing; stay open to deselect or upgrade */}
					{hasCapacityError && fetcher.state === "idle" && (
						<div className="mx-4 mt-4 p-4 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-start gap-3">
							<AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
							<div className="flex-1 min-w-0">
								<p className="font-medium text-amber-700 dark:text-amber-400">
									Cargo capacity exceeded
								</p>
								<p className="text-sm text-muted mt-1">
									Nothing was added. Free plans allow a limited number of Cargo
									items
									{typeof batchResponse?.canAdd === "number" &&
									typeof batchResponse.total === "number"
										? ` (${batchResponse.canAdd} slot${batchResponse.canAdd === 1 ? "" : "s"} left; you selected ${batchResponse.total})`
										: ""}
									. Deselect items to fit your limit, or upgrade to Crew for
									unlimited capacity.
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									<button
										type="button"
										onClick={() => setShowUpgradePrompt(true)}
										className="px-3 py-1.5 rounded-lg bg-hyper-green text-on-hyper-green text-sm font-bold"
									>
										Upgrade to Crew
									</button>
									<Link
										to="/hub/pricing"
										className="px-3 py-1.5 rounded-lg btn-secondary text-sm font-medium"
									>
										View pricing
									</Link>
								</div>
							</div>
						</div>
					)}

					{/* Items List */}
					<div className="flex-1 overflow-y-auto p-4 space-y-2">
						{items.map((item) => {
							const mergeMatch = mergeMatches.get(item.id);
							return (
								<ScanResultItemRow
									key={item.id}
									item={item}
									mergeMatch={mergeMatch ?? null}
									isEditing={editingId === item.id}
									nutritionEngine={nutritionEngine}
									nutritionLookupStatus={nutritionLookupStatus}
									onToggleSelection={toggleSelection}
									onStartEdit={(id) => setEditingId(id)}
									onCancelEdit={() => setEditingId(null)}
									onUpdate={(updates) => {
										const nextName = updates.name ?? item.name;
										const shouldReresolve =
											nutritionEngine &&
											shouldReresolveNutritionAfterNameChange({
												previousName: item.name,
												nextName,
												nutritionSource:
													updates.nutrition?.source ?? item.nutrition?.source,
											});
										if (shouldReresolve) {
											updateItem(item.id, {
												...updates,
												nutrition: undefined,
											});
											setEditingId(null);
											void reresolveItemNutrition(item.id, nextName);
										} else {
											updateItem(item.id, updates);
											setEditingId(null);
										}
									}}
									onDismissMerge={dismissMerge}
								/>
							);
						})}

						{items.length === 0 && (
							<div className="text-center py-12 text-muted">
								No items detected in scan
							</div>
						)}
					</div>

					{/* Footer Actions */}
					<div className="p-6 border-t border-hyper-green/30 flex justify-between items-center">
						<button
							type="button"
							onClick={onClose}
							className="px-6 py-3 text-muted hover:text-hyper-green font-medium transition-colors"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleSubmit}
							disabled={selectedItems.length === 0 || isSubmitting}
							className="px-8 py-3 bg-hyper-green text-on-hyper-green font-bold rounded-lg shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
						>
							{isSubmitting ? (
								<>Processing...</>
							) : (
								<>
									<Check className="w-5 h-5" />
									Add {selectedItems.length} Item
									{selectedItems.length !== 1 ? "s" : ""} to Cargo
								</>
							)}
						</button>
					</div>
				</div>
			</div>
			<UpgradePrompt
				open={showUpgradePrompt}
				onClose={() => setShowUpgradePrompt(false)}
				title="Cargo capacity exceeded"
				description="Upgrade to Crew Member for unlimited Cargo items, meals, and supply lists."
			/>
		</>
	);
}

// Individual item row component
interface ScanResultItemRowProps {
	item: ScanResultItem;
	mergeMatch: MergeMatch | null;
	isEditing: boolean;
	nutritionEngine: boolean;
	nutritionLookupStatus: NutritionLookupStatus;
	onToggleSelection: (id: string) => void;
	onStartEdit: (id: string) => void;
	onCancelEdit: () => void;
	onUpdate: (updates: Partial<ScanResultItem>) => void;
	onDismissMerge: (id: string) => void;
}

function ScanResultItemRow({
	item,
	mergeMatch,
	isEditing,
	nutritionEngine,
	nutritionLookupStatus,
	onToggleSelection,
	onStartEdit,
	onCancelEdit,
	onUpdate,
	onDismissMerge,
}: ScanResultItemRowProps) {
	const [editedItem, setEditedItem] = useState(item);

	useEffect(() => {
		if (isEditing) setEditedItem(item);
	}, [isEditing, item]);

	if (isEditing) {
		return (
			<div className="bg-platinum/40 dark:bg-white/10 border border-hyper-green/50 rounded-lg p-4 space-y-3">
				<DockItemFields
					key={`cargo-${item.id}`}
					idPrefix={`cargo-${item.id}`}
					showNutrition={nutritionEngine}
					value={{
						name: editedItem.name,
						quantity: editedItem.quantity,
						unit: editedItem.unit,
						domain: editedItem.domain || "food",
						tags: editedItem.tags ?? [],
						expiresAt: editedItem.expiresAt,
						nutrition: editedItem.nutrition,
					}}
					onChange={(next) =>
						setEditedItem({
							...editedItem,
							name: next.name,
							quantity: Number.isFinite(next.quantity)
								? next.quantity
								: editedItem.quantity,
							unit: next.unit as ScanResultItem["unit"],
							domain: next.domain as ItemDomain,
							tags: next.tags ?? [],
							expiresAt: next.expiresAt || undefined,
							nutrition: next.nutrition,
						})
					}
				/>

				<div className="flex gap-2 justify-end">
					<button
						type="button"
						onClick={onCancelEdit}
						className="px-4 py-2 text-sm text-muted hover:text-hyper-green transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => onUpdate(editedItem)}
						className="px-4 py-2 bg-hyper-green text-on-hyper-green text-sm font-semibold rounded hover:bg-hyper-green/80 transition-colors"
					>
						Save
					</button>
				</div>
			</div>
		);
	}

	const isLowConfidence =
		typeof item.confidence === "number" && item.confidence < 0.7;
	const kcal =
		item.nutrition?.per100g?.energyKcal ??
		item.nutrition?.perServing?.energyKcal;

	return (
		<div
			className={`bg-platinum/30 dark:bg-white/5 border rounded-lg p-4 hover:border-hyper-green/30 transition-colors ${
				isLowConfidence ? "border-amber-500/30" : "border-platinum/10"
			}`}
		>
			<div className="flex items-start gap-3">
				<input
					type="checkbox"
					checked={item.selected}
					onChange={() => onToggleSelection(item.id)}
					className="mt-1 w-5 h-5 accent-hyper-green rounded border-muted"
				/>
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-3">
						<div className="flex-1">
							<div className="flex items-center gap-2">
								<h3 className="text-lg font-semibold text-carbon capitalize">
									{item.name}
								</h3>
								{isLowConfidence && (
									<span
										title="Low confidence — verify this item"
										className="flex items-center gap-1 text-xs text-amber-500"
									>
										<AlertTriangle className="w-3.5 h-3.5" />
										Verify
									</span>
								)}
							</div>
							<p className="text-sm text-muted">
								{mergeMatch
									? mergeMatch.displayDelta
									: `${item.quantity} ${item.unit}`}
								{item.domain && <> • {DOMAIN_LABELS[item.domain]}</>}
								{item.expiresAt && (
									<>
										{" "}
										• Expires: {new Date(item.expiresAt).toLocaleDateString()}
									</>
								)}
								{nutritionEngine && (
									<NutritionKcalHint
										kcal={kcal}
										lookupStatus={nutritionLookupStatus}
										nutritionField={item.nutrition}
										provenanceLabel={provenanceLabel(
											item.nutrition?.source,
											kcal != null && Number.isFinite(kcal),
										)}
									/>
								)}
							</p>
							{mergeMatch && (
								<div className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-md bg-hyper-green/15 border border-hyper-green/30">
									<p className="text-xs font-medium text-[#007a4d] dark:text-hyper-green">
										Will add to existing: {mergeMatch.target.name} (
										{mergeMatch.target.quantity} {mergeMatch.target.unit})
									</p>
									<button
										type="button"
										onClick={() => onDismissMerge(item.id)}
										className="text-[#007a4d]/60 hover:text-[#007a4d] dark:text-hyper-green/60 dark:hover:text-hyper-green transition-colors flex-shrink-0"
										aria-label="Add as new item instead"
										title="Add as new item instead"
									>
										<X className="w-3 h-3" />
									</button>
								</div>
							)}
						</div>
						<button
							type="button"
							onClick={() => onStartEdit(item.id)}
							className="text-muted hover:text-hyper-green transition-colors"
							aria-label="Edit item"
						>
							<Edit2 className="w-4 h-4" />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
