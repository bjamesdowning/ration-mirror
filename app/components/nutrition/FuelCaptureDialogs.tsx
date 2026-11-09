import { useEffect, useState } from "react";
import type { DayIntakeRow } from "~/components/manifest/DayView";
import { diaryOperationKey } from "~/lib/nutrition/fuel-capture";

type RecentFood = {
	name: string;
	amount: number;
	unit: "serving" | "g" | "oz";
	energyKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
};

type SavedFood = RecentFood & { id: string };

type LogDraft = {
	name: string;
	amount: string;
	unit: "serving" | "g" | "oz";
	energy: string;
	protein: string;
	carbs: string;
	fat: string;
	occurredAt: string;
	operationKey: string;
	idempotencyKey: string;
	savedFoodId: string | null;
};

function emptyDraft(now = new Date()): LogDraft {
	return {
		name: "",
		amount: "1",
		unit: "serving",
		energy: "",
		protein: "",
		carbs: "",
		fat: "",
		occurredAt: now.toISOString(),
		operationKey: diaryOperationKey(null, () => crypto.randomUUID()),
		idempotencyKey: crypto.randomUUID(),
		savedFoodId: null,
	};
}

function draftFromRow(row: DayIntakeRow): LogDraft {
	return {
		name: row.mealName ?? "",
		amount: String(row.loggedAmount ?? row.servings),
		unit: row.loggedUnit ?? "serving",
		energy: String(row.energyKcal),
		protein: String(row.proteinG ?? 0),
		carbs: String(row.carbsG ?? 0),
		fat: String(row.fatG ?? 0),
		occurredAt: row.occurredAt ?? new Date().toISOString(),
		operationKey: diaryOperationKey(null, () => crypto.randomUUID()),
		idempotencyKey: crypto.randomUUID(),
		savedFoodId: null,
	};
}

async function readError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: string; code?: string };
		return body.error || body.code || "Could not save that log.";
	} catch {
		return "Could not save that log.";
	}
}

/**
 * Typed personal log. Shutter and barcode stay disabled until a later release.
 * A failed save keeps the same operation key.
 */
export function LogToFuelDialog({
	open,
	intake,
	savedFoods = false,
	onClose,
	onSaved,
}: {
	open: boolean;
	intake?: DayIntakeRow | null;
	/** nutrition-saved-food. Hidden when the child or parent flag is off. */
	savedFoods?: boolean;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [draft, setDraft] = useState<LogDraft>(() => emptyDraft());
	const [recent, setRecent] = useState<RecentFood[]>([]);
	const [saved, setSaved] = useState<SavedFood[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!open) return;
		setDraft(intake ? draftFromRow(intake) : emptyDraft());
		setError(null);
	}, [open, intake]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		void fetch("/api/nutrition/diary/export")
			.then(async (response) => {
				if (!response.ok) return;
				const body = (await response.json()) as {
					intakes?: Array<{
						name?: string;
						voidedAt?: string | null;
						loggedAmount?: number | null;
						loggedUnit?: "serving" | "g" | "oz" | null;
						servings?: number;
						energyKcal?: number;
						proteinG?: number;
						carbsG?: number;
						fatG?: number;
					}>;
				};
				if (cancelled) return;
				const foods: RecentFood[] = [];
				const seen = new Set<string>();
				for (const row of [...(body.intakes ?? [])].reverse()) {
					if (row.voidedAt || !row.name || seen.has(row.name)) continue;
					seen.add(row.name);
					foods.push({
						name: row.name,
						amount: row.loggedAmount ?? row.servings ?? 1,
						unit: row.loggedUnit ?? "serving",
						energyKcal: row.energyKcal ?? 0,
						proteinG: row.proteinG ?? 0,
						carbsG: row.carbsG ?? 0,
						fatG: row.fatG ?? 0,
					});
					if (foods.length === 8) break;
				}
				setRecent(foods);
			})
			.catch(() => {
				if (!cancelled) setRecent([]);
			});
		return () => {
			cancelled = true;
		};
	}, [open]);

	useEffect(() => {
		if (!open || !savedFoods) {
			setSaved([]);
			return;
		}
		let cancelled = false;
		void fetch("/api/nutrition/saved-food")
			.then(async (response) => {
				if (!response.ok) return;
				const body = (await response.json()) as {
					savedFoods?: Array<{
						id: string;
						name: string;
						energyKcal: number;
						proteinG: number;
						carbsG: number;
						fatG: number;
						defaultAmount: number | null;
						defaultUnit: "serving" | "g" | "oz" | null;
					}>;
				};
				if (!cancelled) {
					setSaved(
						(body.savedFoods ?? []).map((food) => ({
							id: food.id,
							name: food.name,
							amount: food.defaultAmount ?? 1,
							unit: food.defaultUnit ?? "serving",
							energyKcal: food.energyKcal,
							proteinG: food.proteinG,
							carbsG: food.carbsG,
							fatG: food.fatG,
						})),
					);
				}
			})
			.catch(() => {
				if (!cancelled) setSaved([]);
			});
		return () => {
			cancelled = true;
		};
	}, [open, savedFoods]);

	if (!open) return null;

	async function save() {
		const amount = Number(draft.amount);
		const energy = Number(draft.energy);
		const protein = Number(draft.protein);
		const carbs = Number(draft.carbs);
		const fat = Number(draft.fat);
		if (!draft.name.trim() || !Number.isFinite(amount) || amount <= 0) {
			setError("Add a name and an amount.");
			return;
		}
		if (
			[energy, protein, carbs, fat].some(
				(value) => !Number.isFinite(value) || value < 0,
			)
		) {
			setError("Enter kcal, protein, carbs, and fat.");
			return;
		}
		setSaving(true);
		setError(null);
		const payload = draft.savedFoodId
			? {
					savedFoodId: draft.savedFoodId,
					occurredAt: draft.occurredAt,
					idempotencyKey: draft.idempotencyKey,
					operationKey: draft.operationKey,
				}
			: {
					name: draft.name.trim(),
					occurredAt: draft.occurredAt,
					amount,
					unit: draft.unit,
					macros: {
						energyKcal: energy,
						proteinG: protein,
						carbsG: carbs,
						fatG: fat,
					},
					idempotencyKey: draft.idempotencyKey,
					operationKey: draft.operationKey,
				};
		try {
			const response = await fetch(
				intake ? `/api/nutrition/diary/${intake.id}` : "/api/nutrition/diary",
				{
					method: intake ? "PATCH" : "POST",
					headers: {
						"Content-Type": "application/json",
						"Idempotency-Key": draft.operationKey,
					},
					body: JSON.stringify(payload),
				},
			);
			if (!response.ok) {
				setError(await readError(response));
				return;
			}
			onSaved();
			onClose();
		} catch {
			setError("Could not save that log. The draft is still here.");
		} finally {
			setSaving(false);
		}
	}

	function applyFood(food: RecentFood, savedFoodId: string | null) {
		setDraft((current) => ({
			...current,
			name: food.name,
			amount: String(food.amount),
			unit: food.unit,
			energy: String(food.energyKcal),
			protein: String(food.proteinG),
			carbs: String(food.carbsG),
			fat: String(food.fatG),
			savedFoodId,
		}));
	}

	async function starFood(food: RecentFood) {
		setSaving(true);
		setError(null);
		try {
			const response = await fetch("/api/nutrition/saved-food", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: food.name,
					amount: food.amount,
					unit: food.unit,
					macros: {
						energyKcal: food.energyKcal,
						proteinG: food.proteinG,
						carbsG: food.carbsG,
						fatG: food.fatG,
					},
				}),
			});
			if (!response.ok) {
				setError(await readError(response));
				return;
			}
			const savedFood = (await response.json()) as {
				id: string;
				name: string;
				energyKcal: number;
				proteinG: number;
				carbsG: number;
				fatG: number;
				defaultAmount: number | null;
				defaultUnit: "serving" | "g" | "oz" | null;
			};
			setSaved((current) => {
				const next = current.filter((row) => row.id !== savedFood.id);
				return [
					{
						id: savedFood.id,
						name: savedFood.name,
						amount: savedFood.defaultAmount ?? food.amount,
						unit: savedFood.defaultUnit ?? food.unit,
						energyKcal: savedFood.energyKcal,
						proteinG: savedFood.proteinG,
						carbsG: savedFood.carbsG,
						fatG: savedFood.fatG,
					},
					...next,
				];
			});
		} catch {
			setError("Could not save that food.");
		} finally {
			setSaving(false);
		}
	}

	async function voidLog() {
		if (!intake) return;
		setSaving(true);
		setError(null);
		try {
			const response = await fetch(`/api/nutrition/diary/${intake.id}`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					confirm: true,
					operationKey: draft.operationKey,
				}),
			});
			if (!response.ok) {
				setError(await readError(response));
				return;
			}
			onSaved();
			onClose();
		} catch {
			setError("Could not remove that log.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-carbon/40 p-4 sm:items-center">
			<div
				role="dialog"
				aria-labelledby="log-to-fuel-title"
				className="glass-panel w-full max-w-lg rounded-2xl p-5 space-y-4"
			>
				<div>
					<h2 id="log-to-fuel-title" className="text-lg font-bold text-carbon">
						Log to Fuel
					</h2>
					<p className="text-sm text-muted">
						This records what you ate. It does not change Cargo.
					</p>
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						disabled
						className="btn-secondary px-3 py-2 text-sm opacity-50"
					>
						Shutter
					</button>
					<button
						type="button"
						disabled
						className="btn-secondary px-3 py-2 text-sm opacity-50"
					>
						Barcode
					</button>
				</div>
				{savedFoods && saved.length > 0 && (
					<div className="space-y-2">
						<p className="text-xs uppercase tracking-wide text-muted">Saved</p>
						<div className="flex flex-wrap gap-2">
							{saved.map((food) => (
								<button
									key={food.id}
									type="button"
									className="rounded-full border border-platinum px-3 py-1 text-xs"
									onClick={() => applyFood(food, food.id)}
								>
									{food.name}
								</button>
							))}
						</div>
					</div>
				)}
				{recent.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{recent.map((food) => (
							<span key={food.name} className="inline-flex items-center gap-1">
								<button
									type="button"
									className="rounded-full border border-platinum px-3 py-1 text-xs"
									onClick={() => applyFood(food, null)}
								>
									{food.name}
								</button>
								{savedFoods ? (
									<button
										type="button"
										className="rounded-full border border-platinum px-2 py-1 text-xs"
										aria-label={`Star ${food.name}`}
										onClick={() => void starFood(food)}
									>
										Star
									</button>
								) : null}
							</span>
						))}
					</div>
				)}
				<label className="block text-sm">
					Food
					<input
						value={draft.name}
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								name: event.target.value,
								savedFoodId: null,
							}))
						}
						className="mt-1 w-full rounded-lg border border-platinum px-3 py-2"
					/>
				</label>
				<div className="grid grid-cols-2 gap-3">
					<label className="text-sm">
						Amount
						<input
							inputMode="decimal"
							value={draft.amount}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									amount: event.target.value,
									savedFoodId: null,
								}))
							}
							className="mt-1 w-full rounded-lg border border-platinum px-3 py-2"
						/>
					</label>
					<label className="text-sm">
						Unit
						<select
							value={draft.unit}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									unit: event.target.value as LogDraft["unit"],
									savedFoodId: null,
								}))
							}
							className="mt-1 w-full rounded-lg border border-platinum px-3 py-2"
						>
							<option value="serving">serving</option>
							<option value="g">g</option>
							<option value="oz">oz</option>
						</select>
					</label>
				</div>
				<div className="grid grid-cols-2 gap-3">
					{(
						[
							["energy", "kcal"],
							["protein", "Protein g"],
							["carbs", "Carbs g"],
							["fat", "Fat g"],
						] as const
					).map(([key, label]) => (
						<label key={key} className="text-sm">
							{label}
							<input
								inputMode="decimal"
								value={draft[key]}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										[key]: event.target.value,
										savedFoodId: null,
									}))
								}
								className="mt-1 w-full rounded-lg border border-platinum px-3 py-2"
							/>
						</label>
					))}
				</div>
				{error ? <p className="text-sm text-red-600">{error}</p> : null}
				<div className="flex flex-wrap justify-end gap-2">
					{savedFoods && !draft.savedFoodId ? (
						<button
							type="button"
							onClick={() =>
								void starFood({
									name: draft.name.trim(),
									amount: Number(draft.amount),
									unit: draft.unit,
									energyKcal: Number(draft.energy),
									proteinG: Number(draft.protein),
									carbsG: Number(draft.carbs),
									fatG: Number(draft.fat),
								})
							}
							disabled={saving}
							className="px-3 py-2 text-sm"
						>
							Save this food
						</button>
					) : null}
					{intake ? (
						<button
							type="button"
							onClick={() => void voidLog()}
							disabled={saving}
							className="px-3 py-2 text-sm text-red-700"
						>
							Remove my log
						</button>
					) : null}
					<button
						type="button"
						onClick={onClose}
						className="btn-secondary px-4 py-2"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => void save()}
						disabled={saving}
						className="px-4 py-2 bg-hyper-green text-on-hyper-green font-semibold rounded-lg"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}

/** Two actions. Copilot is not on this sheet. */
export function FuelCaptureChoiceDialog({
	open,
	onClose,
	onAddToCargo,
	onLogToFuel,
}: {
	open: boolean;
	onClose: () => void;
	onAddToCargo: () => void;
	onLogToFuel: () => void;
}) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-carbon/40 p-4 sm:items-center">
			<div
				role="dialog"
				aria-labelledby="fuel-capture-title"
				className="glass-panel w-full max-w-md rounded-2xl p-5 space-y-3"
			>
				<h2 id="fuel-capture-title" className="text-lg font-bold text-carbon">
					Capture
				</h2>
				<button
					type="button"
					aria-label="Add to Cargo"
					onClick={onAddToCargo}
					className="block w-full rounded-xl border border-platinum px-4 py-3 text-left"
				>
					<span className="font-semibold">Add to Cargo</span>
					<span className="mt-1 block text-sm text-muted">
						The photo becomes kitchen stock.
					</span>
				</button>
				<button
					type="button"
					aria-label="Log to Fuel"
					onClick={onLogToFuel}
					className="block w-full rounded-xl border border-platinum px-4 py-3 text-left"
				>
					<span className="font-semibold">Log to Fuel</span>
					<span className="mt-1 block text-sm text-muted">
						This records what you ate. It does not change Cargo.
					</span>
				</button>
				<button
					type="button"
					onClick={onClose}
					className="w-full py-2 text-sm text-muted"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
