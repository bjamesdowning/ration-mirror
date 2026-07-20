import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useUnitDisplayMode } from "~/components/shell/UnitDisplayToggle";
import { presentQuantity } from "~/lib/present-quantity";
import {
	SUPPORTED_UNITS,
	type SupportedUnit,
	toSupportedUnit,
} from "~/lib/units";

interface SupplyQuantityEditorProps {
	quantity: number;
	unit: string;
	/** Ingredient name for density-aware display conversion */
	ingredientName?: string;
	onChange: (quantity: number, unit: string) => void;
	disabled?: boolean;
	/** Compact pill style for mobile stacked layout */
	variant?: "pill" | "inline";
	className?: string;
}

export function SupplyQuantityEditor({
	quantity,
	unit,
	ingredientName,
	onChange,
	disabled = false,
	variant = "pill",
	className = "",
}: SupplyQuantityEditorProps) {
	const normalizedUnit = toSupportedUnit(unit);
	const unitMode = useUnitDisplayMode();
	const presented = presentQuantity({
		quantity,
		unit: normalizedUnit,
		ingredientName: ingredientName ?? unit,
		mode: unitMode,
	});
	const [isEditing, setIsEditing] = useState(false);
	const [draftQty, setDraftQty] = useState(String(presented.quantity));
	const [draftUnit, setDraftUnit] = useState<SupportedUnit>(presented.unit);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLFieldSetElement>(null);
	const qtyInputId = useId();
	const unitSelectId = useId();

	useEffect(() => {
		if (!isEditing) {
			setDraftQty(String(presented.quantity));
			setDraftUnit(presented.unit);
		}
	}, [presented.quantity, presented.unit, isEditing]);

	useEffect(() => {
		if (isEditing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [isEditing]);

	const commitDraft = useCallback(() => {
		const qty = Number(draftQty);
		if (!Number.isFinite(qty) || qty < 0) {
			setDraftQty(String(presented.quantity));
			setDraftUnit(presented.unit);
			setIsEditing(false);
			return;
		}
		onChange(qty, draftUnit);
		setIsEditing(false);
	}, [draftQty, draftUnit, presented.quantity, presented.unit, onChange]);

	useEffect(() => {
		if (!isEditing) return;

		function handlePointerDown(e: PointerEvent) {
			if (!containerRef.current?.contains(e.target as Node)) {
				commitDraft();
			}
		}

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setDraftQty(String(presented.quantity));
				setDraftUnit(presented.unit);
				setIsEditing(false);
			}
			if (e.key === "Enter") {
				e.preventDefault();
				commitDraft();
			}
		}

		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isEditing, commitDraft, presented.quantity, presented.unit]);

	function startEditing(e: React.MouseEvent) {
		e.stopPropagation();
		if (disabled) return;
		setDraftQty(String(presented.quantity));
		setDraftUnit(presented.unit);
		setIsEditing(true);
	}

	const displayLabel = presented.formatted;

	const pillClasses =
		variant === "pill"
			? "inline-flex items-center rounded-lg bg-platinum/60 dark:bg-white/15 px-3 py-1.5 text-sm text-data text-carbon dark:text-white/90 hover:bg-platinum dark:hover:bg-white/20 transition-colors min-h-[36px]"
			: "inline-flex items-center rounded-lg bg-platinum/40 dark:bg-white/10 px-2 py-0.5 text-xs text-data text-carbon dark:text-white/90 hover:bg-platinum/60 dark:hover:bg-white/15 transition-colors min-h-[28px] max-w-[96px] justify-end";

	if (isEditing) {
		return (
			<fieldset
				ref={containerRef}
				className={`inline-flex items-center gap-1.5 border-0 p-0 m-0 min-w-0 ${className}`}
			>
				<legend className="sr-only">Edit quantity</legend>
				<input
					ref={inputRef}
					id={qtyInputId}
					type="number"
					inputMode="decimal"
					value={draftQty}
					onChange={(e) => setDraftQty(e.target.value)}
					onClick={(e) => e.stopPropagation()}
					min={0}
					step="any"
					aria-label="Edit quantity"
					className="w-16 bg-platinum dark:bg-white/10 rounded-md px-2 py-1 text-sm text-carbon text-data focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
				/>
				<select
					id={unitSelectId}
					value={draftUnit}
					onChange={(e) => setDraftUnit(e.target.value as SupportedUnit)}
					onClick={(e) => e.stopPropagation()}
					aria-label="Edit unit"
					className="max-w-[72px] bg-platinum dark:bg-white/10 rounded-md px-1.5 py-1 text-sm text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none appearance-none cursor-pointer"
				>
					{SUPPORTED_UNITS.map((u) => (
						<option key={u} value={u}>
							{u}
						</option>
					))}
				</select>
			</fieldset>
		);
	}

	return (
		<button
			type="button"
			onClick={startEditing}
			disabled={disabled}
			className={`${pillClasses} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
			aria-label={`Quantity: ${displayLabel}. Tap to edit.`}
			title="Tap to edit quantity"
		>
			{displayLabel}
		</button>
	);
}
