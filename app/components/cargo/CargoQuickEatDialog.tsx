import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { getTodayISO } from "~/lib/manifest-dates";
import { type NutritionSnapshot, scaleCargoEatMacros } from "~/lib/nutrition";

type QuickEatResponse = {
	entry?: { id: string };
	intakeLogged?: boolean;
	intakeSkipReason?: string | null;
	error?: string;
	code?: string;
};

type CargoQuickEatDialogProps = {
	cargoId: string;
	name: string;
	quantity: number;
	unit: string;
	nutrition: NutritionSnapshot | null | undefined;
	notesEnabled: boolean;
	onClose: () => void;
	onSuccess?: (result: QuickEatResponse) => void;
};

function formatGrams(value: number): string {
	return value % 1 === 0 ? `${value} g` : `${value.toFixed(1)} g`;
}

function defaultAmount(unit: string, stock: number): number {
	const u = unit.toLowerCase();
	if (u === "g" || u === "ml") {
		return Math.min(100, Math.max(1, stock > 0 ? Math.min(100, stock) : 100));
	}
	return 1;
}

function stepForUnit(unit: string): number {
	const u = unit.toLowerCase();
	if (u === "g" || u === "ml") return 10;
	if (u === "kg" || u === "l") return 0.1;
	return 1;
}

/**
 * Web Cargo Quick Eat — amount + macro preview + optional notes → POST quick-eat.
 */
export function CargoQuickEatDialog({
	cargoId,
	name,
	quantity: stockQuantity,
	unit,
	nutrition,
	notesEnabled,
	onClose,
	onSuccess,
}: CargoQuickEatDialogProps) {
	const fetcher = useFetcher<QuickEatResponse>();
	const [amount, setAmount] = useState(() =>
		defaultAmount(unit, stockQuantity),
	);
	const [notes, setNotes] = useState("");
	const handledSuccess = useRef<unknown>(null);
	const isSaving = fetcher.state !== "idle";
	const step = stepForUnit(unit);
	const stockEmpty = stockQuantity <= 0;
	const remaining = Math.max(0, stockQuantity - amount);

	const macros = useMemo(
		() =>
			scaleCargoEatMacros({
				nutrition,
				quantity: amount,
				unit,
				packageQuantity: stockQuantity > 0 ? stockQuantity : null,
			}),
		[nutrition, amount, unit, stockQuantity],
	);
	const hasMacroPreview =
		macros.energyKcal != null ||
		macros.proteinG != null ||
		macros.carbG != null ||
		macros.fatG != null;

	const errorMessage =
		fetcher.state === "idle" && fetcher.data?.error ? fetcher.data.error : null;

	useEffect(() => {
		if (fetcher.state !== "idle") return;
		if (!fetcher.data?.entry?.id) return;
		if (fetcher.data === handledSuccess.current) return;
		handledSuccess.current = fetcher.data;
		onSuccess?.(fetcher.data);
		onClose();
	}, [fetcher.state, fetcher.data, onClose, onSuccess]);

	const handleSubmit = () => {
		if (!(amount > 0) || isSaving) return;
		const trimmed = notes.trim();
		fetcher.submit(
			JSON.stringify({
				quantity: amount,
				unit,
				date: getTodayISO(),
				operationKey: crypto.randomUUID(),
				logIntake: true,
				...(notesEnabled && trimmed.length > 0
					? { notes: trimmed.slice(0, 280) }
					: {}),
			}),
			{
				method: "POST",
				action: `/api/cargo/${cargoId}/quick-eat`,
				encType: "application/json",
			},
		);
	};

	return (
		<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
			<button
				type="button"
				aria-label="Close"
				className="absolute inset-0 bg-carbon/50"
				onClick={onClose}
				disabled={isSaving}
			/>
			<div className="relative w-full max-w-md glass-panel rounded-xl border border-platinum p-5 space-y-4 shadow-xl">
				<div>
					<p className="text-[10px] font-mono uppercase tracking-wide text-muted">
						Private log
					</p>
					<h2 className="text-lg font-bold text-carbon mt-1">Eat</h2>
					<p className="text-sm text-muted mt-2 capitalize">
						{name} — snack on today&apos;s Manifest; optional private intake.
					</p>
					<p className="text-[10px] text-muted mt-2">
						Not medical advice. Goals and totals are planning aids only.
					</p>
				</div>

				<label className="block space-y-2">
					<span className="text-xs font-mono text-muted uppercase tracking-wide">
						Amount ({unit})
					</span>
					<input
						type="number"
						min={step}
						max={1000}
						step={step}
						value={amount}
						onChange={(e) => {
							const next = Number(e.target.value);
							if (Number.isFinite(next)) setAmount(next);
						}}
						className="w-full px-3 py-2.5 text-sm bg-transparent border border-platinum rounded-lg text-carbon font-mono focus:outline-none focus:border-hyper-green focus:ring-1 focus:ring-hyper-green"
					/>
					{stockEmpty ? (
						<p className="text-xs text-muted">
							Pantry empty — snack will still appear on Manifest.
						</p>
					) : amount > stockQuantity ? (
						<p className="text-xs text-warning">
							Only {stockQuantity} {unit} in pantry — extras won&apos;t deduct.
						</p>
					) : (
						<p className="text-xs text-muted">
							Remaining after: {remaining} {unit}
						</p>
					)}
				</label>

				<div className="rounded-lg border border-platinum p-3 space-y-2">
					{hasMacroPreview ? (
						<>
							{macros.energyKcal != null ? (
								<div className="flex justify-between text-xs font-mono text-carbon">
									<span>Calories</span>
									<span>{Math.round(macros.energyKcal)} kcal</span>
								</div>
							) : null}
							{macros.proteinG != null ? (
								<div className="flex justify-between text-xs font-mono text-carbon">
									<span>Protein</span>
									<span>{formatGrams(macros.proteinG)}</span>
								</div>
							) : null}
							{macros.carbG != null ? (
								<div className="flex justify-between text-xs font-mono text-carbon">
									<span>Carbs</span>
									<span>{formatGrams(macros.carbG)}</span>
								</div>
							) : null}
							{macros.fatG != null ? (
								<div className="flex justify-between text-xs font-mono text-carbon">
									<span>Fat</span>
									<span>{formatGrams(macros.fatG)}</span>
								</div>
							) : null}
							<p className="text-[10px] text-muted">
								Estimates scale with amount. Saving logs nutrients to your
								private intake when available.
							</p>
						</>
					) : (
						<p className="text-xs text-muted">
							Nutrition unavailable for this item.
						</p>
					)}
				</div>

				{notesEnabled ? (
					<label className="block space-y-2">
						<span className="text-xs font-mono text-muted uppercase tracking-wide">
							Notes (optional)
						</span>
						<textarea
							value={notes}
							maxLength={280}
							rows={2}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Private note — never shared with your household"
							className="w-full px-3 py-2 text-sm bg-transparent border border-platinum rounded-lg text-carbon focus:outline-none focus:border-hyper-green focus:ring-1 focus:ring-hyper-green resize-none"
						/>
					</label>
				) : null}

				{errorMessage ? (
					<p className="text-xs text-danger">{errorMessage}</p>
				) : null}

				<button
					type="button"
					onClick={handleSubmit}
					disabled={isSaving || !(amount > 0)}
					className="w-full py-3 rounded-xl bg-hyper-green text-on-hyper-green font-bold disabled:opacity-60"
				>
					{isSaving ? "Saving…" : "Eat"}
				</button>
				<button
					type="button"
					onClick={onClose}
					disabled={isSaving}
					className="w-full py-2 text-sm text-muted hover:text-carbon"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
