import { useState } from "react";
import { TagChipEditor } from "~/components/shared/TagChipEditor";
import { DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import { SUPPORTED_UNITS, type SupportedUnit } from "~/lib/units";

export type DockItemDraft = {
	name: string;
	quantity: number;
	unit: string;
	domain: string;
	tags?: string[];
	expiresAt?: string | null;
};

const inputClassName =
	"w-full bg-platinum/10 border border-hyper-green/30 rounded px-3 py-2 text-sm text-carbon dark:text-ceramic focus:ring-2 focus:ring-hyper-green/50 focus:outline-none";

type DockItemFieldsProps = {
	value: DockItemDraft;
	onChange: (next: DockItemDraft) => void;
	idPrefix?: string;
	tagSuggestions?: string[];
};

/**
 * Shared post-scan dock fields for Cargo ScanResultsModal and SupplyScanReviewModal.
 */
export function DockItemFields({
	value,
	onChange,
	idPrefix = "dock",
	tagSuggestions = [],
}: DockItemFieldsProps) {
	const [quantityText, setQuantityText] = useState(() =>
		Number.isFinite(value.quantity) ? String(value.quantity) : "",
	);

	const patch = (partial: Partial<DockItemDraft>) =>
		onChange({ ...value, ...partial });

	return (
		<div className="space-y-3">
			<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
				<div>
					<label
						htmlFor={`${idPrefix}-name`}
						className="text-xs text-muted block mb-1"
					>
						Item Name
					</label>
					<input
						id={`${idPrefix}-name`}
						type="text"
						inputMode="text"
						value={value.name}
						onChange={(e) => patch({ name: e.target.value })}
						className={inputClassName}
					/>
				</div>
				<div>
					<label
						htmlFor={`${idPrefix}-quantity`}
						className="text-xs text-muted block mb-1"
					>
						Quantity
					</label>
					<input
						id={`${idPrefix}-quantity`}
						type="number"
						inputMode="decimal"
						value={quantityText}
						onChange={(e) => {
							const raw = e.target.value;
							setQuantityText(raw);
							const parsed = Number(raw);
							if (Number.isFinite(parsed)) {
								patch({ quantity: parsed });
							}
						}}
						min={0}
						step="any"
						className={inputClassName}
					/>
				</div>
				<div>
					<label
						htmlFor={`${idPrefix}-unit`}
						className="text-xs text-muted block mb-1"
					>
						Unit
					</label>
					<select
						id={`${idPrefix}-unit`}
						value={value.unit}
						onChange={(e) => patch({ unit: e.target.value as SupportedUnit })}
						className={inputClassName}
					>
						{SUPPORTED_UNITS.map((u) => (
							<option key={u} value={u}>
								{u}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				<div>
					<label
						htmlFor={`${idPrefix}-domain`}
						className="text-xs text-muted block mb-1"
					>
						Domain
					</label>
					<select
						id={`${idPrefix}-domain`}
						value={value.domain || "food"}
						onChange={(e) => patch({ domain: e.target.value })}
						className={inputClassName}
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
						htmlFor={`${idPrefix}-expiry`}
						className="text-xs text-muted block mb-1"
					>
						Expiry Date
					</label>
					<input
						id={`${idPrefix}-expiry`}
						type="date"
						value={value.expiresAt || ""}
						onChange={(e) => patch({ expiresAt: e.target.value || null })}
						className={inputClassName}
					/>
				</div>
			</div>

			<div>
				<p className="text-xs text-muted mb-1">Tags</p>
				<TagChipEditor
					value={value.tags ?? []}
					onChange={(tags) => patch({ tags })}
					suggestions={tagSuggestions}
				/>
			</div>
		</div>
	);
}
