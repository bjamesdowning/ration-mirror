import { AlertTriangle, Calendar, Check, Edit2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import { normalizeForMatch, tokenMatchScore } from "~/lib/matching";
import type { ScanResult, ScanResultItem } from "~/lib/schemas/scan";
import { getUnitMultiplier, type SupportedUnit } from "~/lib/units";

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

function formatQuantity(value: number): string {
	const rounded = Number.isInteger(value) ? value : Number(value.toFixed(2));
	return `${rounded}`;
}

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
	const [dismissedMerges, setDismissedMerges] = useState<Set<string>>(
		new Set(),
	);

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
				const multiplier = getUnitMultiplier(
					item.unit as SupportedUnit,
					candidate.unit as SupportedUnit,
				);
				if (multiplier === null) continue;
				const normalizedCandidate = normalizeForMatch(candidate.name);

				const exact = normalizedItem === normalizedCandidate;
				const score = exact ? 1 : tokenMatchScore(item.name, candidate.name);

				if (score >= 0.8 && score > bestScore) {
					bestScore = score;
					const convertedQuantity = item.quantity * multiplier;
					bestMatch = {
						target: candidate,
						convertedQuantity,
						displayDelta: `+${formatQuantity(convertedQuantity)} ${candidate.unit}`,
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
			};
		});

		// biome-ignore lint/suspicious/noExplicitAny: fetcher submit type limitation
		fetcher.submit(JSON.stringify({ items: itemsToAdd }) as any, {
			method: "POST",
			action: "/api/cargo/batch",
			encType: "application/json",
		});
	};

	// Handle success
	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data?.success) {
			onSuccess();
			onClose();
		}
	}, [fetcher.state, fetcher.data, onSuccess, onClose]);

	return (
		<div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-carbon/80 backdrop-blur-sm">
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

				{/* Bulk Controls */}
				<div className="p-4 border-b border-hyper-green/30 bg-carbon/20">
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
									className="px-4 py-2 bg-hyper-green text-carbon font-semibold rounded-lg hover:bg-hyper-green/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
								onToggleSelection={toggleSelection}
								onStartEdit={(id) => setEditingId(id)}
								onCancelEdit={() => setEditingId(null)}
								onUpdate={(updates) => {
									updateItem(item.id, updates);
									setEditingId(null);
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
						className="px-8 py-3 bg-hyper-green text-carbon font-bold rounded-lg shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
	);
}

// Individual item row component
interface ScanResultItemRowProps {
	item: ScanResultItem;
	mergeMatch: MergeMatch | null;
	isEditing: boolean;
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
	onToggleSelection,
	onStartEdit,
	onCancelEdit,
	onUpdate,
	onDismissMerge,
}: ScanResultItemRowProps) {
	const [editedItem, setEditedItem] = useState(item);

	if (isEditing) {
		return (
			<div className="bg-carbon/30 border border-hyper-green/50 rounded-lg p-4 space-y-3">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
					<div>
						{/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps input logically */}
						<label className="text-xs text-muted block mb-1">Item Name</label>
						<input
							type="text"
							value={editedItem.name}
							onChange={(e) =>
								setEditedItem({ ...editedItem, name: e.target.value })
							}
							className="w-full bg-platinum/10 border border-hyper-green/30 rounded px-3 py-2 text-sm text-white dark:text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>
					<div>
						<label
							htmlFor="edit-quantity"
							className="text-xs text-muted block mb-1"
						>
							Quantity
						</label>
						<input
							id="edit-quantity"
							type="number"
							value={editedItem.quantity}
							onChange={(e) =>
								setEditedItem({
									...editedItem,
									quantity: Number(e.target.value),
								})
							}
							min="0"
							step="any"
							className="w-full bg-platinum/10 border border-hyper-green/30 rounded px-3 py-2 text-sm text-white dark:text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>
					<div>
						<label
							htmlFor="edit-unit"
							className="text-xs text-muted block mb-1"
						>
							Unit
						</label>
						<select
							id="edit-unit"
							value={editedItem.unit}
							onChange={(e) =>
								setEditedItem({
									...editedItem,
									unit: e.target.value as
										| "kg"
										| "g"
										| "lb"
										| "oz"
										| "l"
										| "ml"
										| "unit"
										| "can"
										| "pack",
								})
							}
							className="w-full bg-platinum/10 border border-hyper-green/30 rounded px-3 py-2 text-sm text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						>
							<option value="unit">Unit</option>
							<option value="kg">kg</option>
							<option value="g">g</option>
							<option value="lb">lb</option>
							<option value="oz">oz</option>
							<option value="l">L</option>
							<option value="ml">mL</option>
							<option value="can">Can</option>
							<option value="pack">Pack</option>
						</select>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<label
							className="text-xs text-muted block mb-1"
							htmlFor="edit-domain"
						>
							Domain
						</label>
						<select
							id="edit-domain"
							value={editedItem.domain || "food"}
							onChange={(e) =>
								setEditedItem({
									...editedItem,
									domain: e.target.value as ItemDomain,
								})
							}
							className="w-full bg-platinum/10 border border-hyper-green/30 rounded px-3 py-2 text-sm text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						>
							{ITEM_DOMAINS.map((domain) => (
								<option key={domain} value={domain}>
									{DOMAIN_LABELS[domain]}
								</option>
							))}
						</select>
					</div>
					<div>
						<label
							htmlFor="edit-expiry"
							className="text-xs text-muted block mb-1"
						>
							Expiry Date
						</label>
						<input
							id="edit-expiry"
							type="date"
							value={editedItem.expiresAt || ""}
							onChange={(e) =>
								setEditedItem({ ...editedItem, expiresAt: e.target.value })
							}
							className="w-full bg-platinum/10 border border-hyper-green/30 rounded px-3 py-2 text-sm text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						/>
					</div>
				</div>

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
						className="px-4 py-2 bg-hyper-green text-carbon text-sm font-semibold rounded hover:bg-hyper-green/80 transition-colors"
					>
						Save
					</button>
				</div>
			</div>
		);
	}

	const isLowConfidence =
		typeof item.confidence === "number" && item.confidence < 0.7;

	return (
		<div
			className={`bg-carbon/20 border rounded-lg p-4 hover:border-hyper-green/30 transition-colors ${
				isLowConfidence ? "border-amber-500/30" : "border-platinum/10"
			}`}
		>
			<div className="flex items-start gap-3">
				<input
					type="checkbox"
					checked={item.selected}
					onChange={() => onToggleSelection(item.id)}
					className="mt-1 w-5 h-5 accent-hyper-green rounded"
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
							</p>
							{mergeMatch && (
								<div className="flex items-center gap-1.5 mt-1">
									<p className="text-xs text-hyper-green/80">
										Will add to existing: {mergeMatch.target.name} (
										{mergeMatch.target.quantity} {mergeMatch.target.unit})
									</p>
									<button
										type="button"
										onClick={() => onDismissMerge(item.id)}
										className="text-hyper-green/50 hover:text-muted transition-colors flex-shrink-0"
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
