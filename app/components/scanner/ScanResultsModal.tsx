import { Calendar, Check, Edit2, X } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { formatInventoryCategory, INVENTORY_CATEGORIES } from "~/lib/inventory";
import type { ScanResult, ScanResultItem } from "~/lib/schemas/scan";

interface ScanResultsModalProps {
	result: ScanResult;
	onClose: () => void;
	onSuccess: () => void;
}

export function ScanResultsModal({
	result,
	onClose,
	onSuccess,
}: ScanResultsModalProps) {
	const fetcher = useFetcher();
	const [items, setItems] = useState<ScanResultItem[]>(result.items);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [bulkEditMode, setBulkEditMode] = useState(false);
	const [bulkExpiryDate, setBulkExpiryDate] = useState("");

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

	// Handle submit
	const handleSubmit = () => {
		const itemsToAdd = selectedItems.map((item) => ({
			name: item.name,
			quantity: item.quantity,
			unit: item.unit,
			category: item.category || "other",
			tags: item.tags,
			expiresAt: item.expiresAt,
		}));

		// biome-ignore lint/suspicious/noExplicitAny: fetcher submit type limitation
		fetcher.submit(JSON.stringify({ items: itemsToAdd }) as any, {
			method: "POST",
			action: "/api/inventory/batch",
			encType: "application/json",
		});
	};

	// Handle success
	if (fetcher.state === "idle" && fetcher.data?.success) {
		onSuccess();
		onClose();
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-carbon/80 backdrop-blur-sm">
			<div className="bg-void-dark border-2 border-hyper-green rounded-xl shadow-glow max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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
					{items.map((item) => (
						<ScanResultItemRow
							key={item.id}
							item={item}
							isEditing={editingId === item.id}
							onToggleSelection={toggleSelection}
							onStartEdit={(id) => setEditingId(id)}
							onCancelEdit={() => setEditingId(null)}
							onUpdate={(updates) => {
								updateItem(item.id, updates);
								setEditingId(null);
							}}
						/>
					))}

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
								{selectedItems.length !== 1 ? "s" : ""} to Pantry
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
	isEditing: boolean;
	onToggleSelection: (id: string) => void;
	onStartEdit: (id: string) => void;
	onCancelEdit: () => void;
	onUpdate: (updates: Partial<ScanResultItem>) => void;
}

function ScanResultItemRow({
	item,
	isEditing,
	onToggleSelection,
	onStartEdit,
	onCancelEdit,
	onUpdate,
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
							className="w-full bg-platinum/10 border border-hyper-green/30 rounded px-3 py-2 text-sm text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
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
							className="w-full bg-platinum/10 border border-hyper-green/30 rounded px-3 py-2 text-sm text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
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
							htmlFor="edit-category"
						>
							Category
						</label>
						<select
							id="edit-category"
							value={editedItem.category || "other"}
							onChange={(e) =>
								setEditedItem({
									...editedItem,
									category: e.target.value as any,
								})
							}
							className="w-full bg-platinum/10 border border-hyper-green/30 rounded px-3 py-2 text-sm text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
						>
							{INVENTORY_CATEGORIES.map((cat) => (
								<option key={cat} value={cat}>
									{formatInventoryCategory(cat)}
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

	return (
		<div className="bg-carbon/20 border border-platinum/10 rounded-lg p-4 hover:border-hyper-green/30 transition-colors">
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
							<h3 className="text-lg font-semibold text-carbon capitalize">
								{item.name}
							</h3>
							<p className="text-sm text-muted">
								{item.quantity} {item.unit}
								{item.category && (
									<> • {formatInventoryCategory(item.category)}</>
								)}
								{item.expiresAt && (
									<>
										{" "}
										• Expires: {new Date(item.expiresAt).toLocaleDateString()}
									</>
								)}
							</p>
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
