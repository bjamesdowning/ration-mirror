import { AlertTriangle, Check, Edit2, Link2, Unlink, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import type { ScanResultItem } from "~/lib/schemas/scan";
import type { SupplyItemWithSource } from "~/lib/supply.server";
import type { SupplyScanPair } from "~/lib/supply-scan-match.server";
import type { SupportedUnit } from "~/lib/units";
import { DockItemFields } from "./DockItemFields";

type ReviewPair = {
	id: string;
	selected: boolean;
	scanItem: ScanResultItem;
	supplyItem: SupplyItemWithSource | null;
	matchType: "exact" | "fuzzy" | "manual";
	wasPreChecked: boolean;
	dockName: string;
	dockQuantity: number;
	dockUnit: SupportedUnit;
	dockDomain: string;
	dockTags: string[];
	dockExpiresAt?: string | null;
	hasDelta: boolean;
};

interface SupplyScanReviewModalProps {
	listId: string;
	requestId: string;
	initialPairs: SupplyScanPair[];
	receiptOnly: ScanResultItem[];
	supplyOnly: SupplyItemWithSource[];
	onClose: () => void;
	onSuccess: () => void;
}

function toReviewPair(pair: SupplyScanPair): ReviewPair {
	const confident = (pair.scanItem.confidence ?? 1) >= 0.7;
	return {
		id: pair.scanItem.id,
		selected: confident && pair.matchScore >= 0.7,
		scanItem: pair.scanItem,
		supplyItem: pair.supplyItem,
		matchType: pair.matchType,
		wasPreChecked: pair.wasPreChecked,
		dockName: pair.scanItem.name,
		dockQuantity: pair.quantityProposal.dockQuantity,
		dockUnit: pair.quantityProposal.dockUnit,
		dockDomain: pair.scanItem.domain ?? "food",
		dockTags: pair.scanItem.tags ?? [],
		dockExpiresAt: pair.scanItem.expiresAt,
		hasDelta: pair.quantityProposal.hasDelta,
	};
}

function receiptOnlyToPair(item: ScanResultItem): ReviewPair {
	return {
		id: item.id,
		selected: (item.confidence ?? 1) >= 0.7,
		scanItem: item,
		supplyItem: null,
		matchType: "manual",
		wasPreChecked: false,
		dockName: item.name,
		dockQuantity: item.quantity,
		dockUnit: item.unit as SupportedUnit,
		dockDomain: item.domain ?? "food",
		dockTags: item.tags ?? [],
		dockExpiresAt: item.expiresAt,
		hasDelta: false,
	};
}

export function SupplyScanReviewModal({
	listId,
	requestId,
	initialPairs,
	receiptOnly,
	supplyOnly,
	onClose,
	onSuccess,
}: SupplyScanReviewModalProps) {
	const fetcher = useFetcher<{
		docked?: number;
		error?: string;
	}>();
	const [pairs, setPairs] = useState<ReviewPair[]>(() => [
		...initialPairs.map(toReviewPair),
		...receiptOnly.map(receiptOnlyToPair),
	]);
	const [showSupplyOnly, setShowSupplyOnly] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editSnapshot, setEditSnapshot] = useState<ReviewPair | null>(null);

	const selectedCount = useMemo(
		() => pairs.filter((p) => p.selected).length,
		[pairs],
	);
	const isSubmitting = fetcher.state !== "idle";

	const updatePair = useCallback((id: string, updates: Partial<ReviewPair>) => {
		setPairs((prev) =>
			prev.map((p) => (p.id === id ? { ...p, ...updates } : p)),
		);
	}, []);

	const beginEdit = (pair: ReviewPair) => {
		setEditSnapshot({ ...pair, dockTags: [...pair.dockTags] });
		setEditingId(pair.id);
	};

	const cancelEdit = () => {
		if (editSnapshot) {
			updatePair(editSnapshot.id, editSnapshot);
		}
		setEditSnapshot(null);
		setEditingId(null);
	};

	const finishEdit = () => {
		setEditSnapshot(null);
		setEditingId(null);
	};

	const unlinkPair = (id: string) => {
		updatePair(id, { supplyItem: null, matchType: "manual" });
	};

	const linkToSupply = (pairId: string, supplyItem: SupplyItemWithSource) => {
		updatePair(pairId, {
			supplyItem,
			matchType: "manual",
			wasPreChecked: supplyItem.isPurchased,
		});
	};

	const availableSupplyForLink = useMemo(() => {
		const linkedIds = new Set(
			pairs
				.filter((p) => p.supplyItem)
				.map((p) => p.supplyItem?.id)
				.filter((id): id is string => typeof id === "string"),
		);
		return supplyOnly.filter((s) => !linkedIds.has(s.id));
	}, [pairs, supplyOnly]);

	const handleSubmit = () => {
		const payload = {
			requestId,
			pairs: pairs
				.filter((p) => p.selected)
				.map((p) => ({
					scanItemId: p.scanItem.id,
					supplyItemId: p.supplyItem?.id ?? null,
					matchType: p.matchType,
					dock: {
						name: p.dockName,
						quantity: p.dockQuantity,
						unit: p.dockUnit,
						domain: p.dockDomain,
						tags: p.dockTags,
						expiresAt: p.dockExpiresAt || undefined,
					},
					updateSupply:
						p.supplyItem && p.hasDelta
							? { quantity: p.dockQuantity, unit: p.dockUnit }
							: undefined,
				})),
		};

		fetcher.submit(JSON.stringify(payload), {
			method: "POST",
			action: `/api/supply-lists/${listId}/scan-complete`,
			encType: "application/json",
		});
	};

	useEffect(() => {
		if (fetcher.state !== "idle" || !fetcher.data) return;
		if (typeof fetcher.data.docked === "number") {
			onSuccess();
		}
	}, [fetcher.state, fetcher.data, onSuccess]);

	return (
		<div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-carbon/40 backdrop-blur-sm p-0 md:p-4">
			<div className="bg-ceramic dark:bg-carbon w-full md:max-w-2xl md:rounded-2xl shadow-xl max-h-[92vh] flex flex-col">
				<div className="flex items-center justify-between px-4 py-3 border-b border-platinum dark:border-white/10">
					<div>
						<h2 className="text-lg font-bold text-carbon dark:text-ceramic">
							Review receipt matches
						</h2>
						<p className="text-xs text-muted">
							Confirm pairings before docking to Cargo
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 rounded-lg hover:bg-platinum/60"
						aria-label="Close"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto p-4 space-y-3">
					{pairs.length === 0 && (
						<p className="text-sm text-muted text-center py-8">
							No receipt lines to review.
						</p>
					)}

					{pairs.map((pair) => {
						const lowConfidence = (pair.scanItem.confidence ?? 1) < 0.7;
						const isEditing = editingId === pair.id;
						return (
							<div
								key={pair.id}
								className={`rounded-xl border p-3 space-y-2 ${
									pair.selected
										? "border-hyper-green/30 bg-hyper-green/5"
										: "border-platinum dark:border-white/10"
								}`}
							>
								{isEditing ? (
									<div className="space-y-3">
										<DockItemFields
											key={`supply-edit-${pair.id}`}
											idPrefix={`supply-${pair.id}`}
											value={{
												name: pair.dockName,
												quantity: pair.dockQuantity,
												unit: pair.dockUnit,
												domain: pair.dockDomain,
												tags: pair.dockTags,
												expiresAt: pair.dockExpiresAt,
											}}
											onChange={(next) => {
												const nameChanged =
													next.name.trim() !== pair.dockName.trim();
												updatePair(pair.id, {
													dockName: next.name,
													dockQuantity: Number.isFinite(next.quantity)
														? next.quantity
														: pair.dockQuantity,
													dockUnit: next.unit as SupportedUnit,
													dockDomain: next.domain,
													dockTags: next.tags ?? [],
													dockExpiresAt: next.expiresAt,
													matchType:
														pair.supplyItem && nameChanged
															? "manual"
															: pair.matchType,
													hasDelta: pair.supplyItem
														? Math.abs(
																next.quantity - pair.supplyItem.quantity,
															) > 0.0001 || next.unit !== pair.supplyItem.unit
														: false,
												});
											}}
										/>
										<div className="flex justify-end gap-2">
											<button
												type="button"
												onClick={cancelEdit}
												className="px-3 py-1.5 text-sm text-muted hover:text-carbon"
											>
												Cancel
											</button>
											<button
												type="button"
												onClick={finishEdit}
												className="px-3 py-1.5 text-sm bg-hyper-green text-carbon font-semibold rounded"
											>
												Done
											</button>
										</div>
									</div>
								) : (
									<div className="flex items-start gap-2">
										<input
											type="checkbox"
											checked={pair.selected}
											onChange={() =>
												updatePair(pair.id, { selected: !pair.selected })
											}
											className="mt-1"
											aria-label={`Include ${pair.dockName} in dock`}
										/>
										<div className="flex-1 min-w-0 space-y-1">
											<div className="flex items-center gap-2 flex-wrap">
												<span className="text-[10px] uppercase font-mono text-muted">
													Receipt
												</span>
												{lowConfidence && (
													<span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
														<AlertTriangle className="w-3 h-3" />
														Low confidence
													</span>
												)}
											</div>
											<p className="text-sm font-semibold capitalize">
												{pair.dockName}
											</p>
											<p className="text-xs font-mono text-muted">
												{pair.dockQuantity} {pair.dockUnit}
												{pair.dockDomain ? ` · ${pair.dockDomain}` : ""}
											</p>

											<div className="flex items-center gap-1 text-muted py-1">
												{pair.supplyItem ? (
													<Link2 className="w-3.5 h-3.5 text-hyper-green" />
												) : (
													<Unlink className="w-3.5 h-3.5" />
												)}
												<span className="text-[10px] uppercase font-mono">
													{pair.supplyItem ? "Supply match" : "Receipt only"}
												</span>
											</div>

											{pair.supplyItem && (
												<div className="rounded-lg bg-white/60 dark:bg-carbon/20 px-2 py-1.5">
													<p className="text-sm capitalize">
														{pair.supplyItem.name}
													</p>
													<p className="text-xs font-mono text-muted">
														{pair.supplyItem.quantity} {pair.supplyItem.unit}
														{pair.wasPreChecked && (
															<span className="ml-2 text-hyper-green">
																In cart
															</span>
														)}
													</p>
												</div>
											)}

											{pair.hasDelta && (
												<p className="text-xs text-amber-700 dark:text-amber-400">
													Qty delta — dock{" "}
													<span className="font-mono">
														{pair.dockQuantity} {pair.dockUnit}
													</span>
												</p>
											)}

											<div className="flex gap-2 pt-1">
												{pair.supplyItem && (
													<button
														type="button"
														onClick={() => unlinkPair(pair.id)}
														className="text-xs text-muted hover:text-carbon flex items-center gap-1"
													>
														<Unlink className="w-3 h-3" />
														Unlink
													</button>
												)}
												{!pair.supplyItem &&
													availableSupplyForLink.length > 0 && (
														<select
															className="text-xs rounded border border-platinum px-1 py-0.5"
															defaultValue=""
															onChange={(e) => {
																const supplyId = e.target.value;
																if (!supplyId) return;
																const item = availableSupplyForLink.find(
																	(s) => s.id === supplyId,
																);
																if (item) linkToSupply(pair.id, item);
																e.target.value = "";
															}}
														>
															<option value="">Link to supply item…</option>
															{availableSupplyForLink.map((s) => (
																<option key={s.id} value={s.id}>
																	{s.name} ({s.quantity} {s.unit})
																</option>
															))}
														</select>
													)}
											</div>
										</div>
										<button
											type="button"
											onClick={() => beginEdit(pair)}
											className="text-muted hover:text-hyper-green transition-colors"
											aria-label="Edit item"
										>
											<Edit2 className="w-4 h-4" />
										</button>
									</div>
								)}
							</div>
						);
					})}

					{supplyOnly.length > 0 && (
						<div className="border border-platinum dark:border-white/10 rounded-xl overflow-hidden">
							<button
								type="button"
								onClick={() => setShowSupplyOnly(!showSupplyOnly)}
								className="w-full px-3 py-2 text-left text-sm font-medium flex justify-between"
							>
								<span>List only ({supplyOnly.length})</span>
								<span className="text-muted text-xs">
									{showSupplyOnly ? "Hide" : "Show"}
								</span>
							</button>
							{showSupplyOnly && (
								<ul className="px-3 pb-3 space-y-1 text-sm text-muted">
									{supplyOnly.map((item) => (
										<li key={item.id} className="flex justify-between gap-2">
											<span className="capitalize">{item.name}</span>
											<span className="font-mono text-xs shrink-0">
												{item.quantity} {item.unit}
												{item.isPurchased ? " · in cart" : ""}
											</span>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>

				<div className="border-t border-platinum dark:border-white/10 p-4 flex gap-2">
					<button
						type="button"
						onClick={onClose}
						className="flex-1 py-3 rounded-xl btn-secondary font-semibold"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={selectedCount === 0 || isSubmitting}
						className="flex-1 py-3 rounded-xl bg-hyper-green text-carbon font-bold disabled:opacity-50 flex items-center justify-center gap-2"
					>
						{isSubmitting ? (
							<span className="animate-pulse">Docking…</span>
						) : (
							<>
								<Check className="w-4 h-4" />
								Dock {selectedCount} item{selectedCount === 1 ? "" : "s"} to
								Cargo
							</>
						)}
					</button>
				</div>

				{fetcher.data?.error && (
					<p className="px-4 pb-3 text-sm text-red-600">{fetcher.data.error}</p>
				)}
			</div>
		</div>
	);
}
