import { useState } from "react";
import { useFetcher } from "react-router";
import {
	OPTIONAL_GOALS_DRAFT_COPY,
	OPTIONAL_GOALS_NOT_MEDICAL,
	type OptionalGoalFields,
	optionalGoalWrite,
} from "~/lib/nutrition/optional-goals";

const EMPTY_FIELDS: OptionalGoalFields = {
	dailyEnergyKcal: "",
	proteinG: "",
	carbsG: "",
	fatG: "",
	fiberG: "",
};

/**
 * Optional empty targets after Macro Tracking is on.
 * Skip and an empty Save do not call the goals API.
 */
export function OptionalGoalsStep({
	goalsEnabled,
	onDone,
}: {
	goalsEnabled: boolean;
	onDone: () => void;
}) {
	const fetcher = useFetcher();
	const [fields, setFields] = useState<OptionalGoalFields>(EMPTY_FIELDS);
	const saving = fetcher.state !== "idle";

	function finishWithoutWrite() {
		onDone();
	}

	function save() {
		const write = optionalGoalWrite(fields, goalsEnabled);
		if (!write) {
			finishWithoutWrite();
			return;
		}
		fetcher.submit(
			JSON.stringify({
				...write,
				effectiveFrom: new Date().toISOString().slice(0, 10),
				operationKey: crypto.randomUUID(),
			}),
			{
				method: "POST",
				action: "/api/nutrition/goals",
				encType: "application/json",
			},
		);
		onDone();
	}

	return (
		<div className="relative z-10 w-full max-w-lg mx-4 bg-ceramic dark:bg-[#1A1A1A] border border-platinum dark:border-white/10 rounded-2xl shadow-xl overflow-hidden">
			<div className="h-1 w-full bg-hyper-green" />
			<div className="p-6 md:p-8 space-y-4">
				<h2 className="text-xl font-bold text-carbon dark:text-white leading-tight">
					{OPTIONAL_GOALS_DRAFT_COPY}
				</h2>
				<p className="text-xs text-muted">Draft, pending review.</p>
				<p className="text-xs text-muted">{OPTIONAL_GOALS_NOT_MEDICAL}</p>
				<div className="grid grid-cols-2 gap-3">
					<Field
						label="kcal / day"
						value={fields.dailyEnergyKcal}
						onChange={(dailyEnergyKcal) =>
							setFields((current) => ({ ...current, dailyEnergyKcal }))
						}
					/>
					<Field
						label="Protein g"
						value={fields.proteinG}
						onChange={(proteinG) =>
							setFields((current) => ({ ...current, proteinG }))
						}
					/>
					<Field
						label="Carbs g"
						value={fields.carbsG}
						onChange={(carbsG) =>
							setFields((current) => ({ ...current, carbsG }))
						}
					/>
					<Field
						label="Fat g"
						value={fields.fatG}
						onChange={(fatG) => setFields((current) => ({ ...current, fatG }))}
					/>
					<Field
						label="Fiber g"
						value={fields.fiberG}
						onChange={(fiberG) =>
							setFields((current) => ({ ...current, fiberG }))
						}
					/>
				</div>
				<div className="flex items-center justify-between gap-3">
					<button
						type="button"
						onClick={finishWithoutWrite}
						className="text-xs text-muted hover:text-carbon dark:hover:text-white"
					>
						Skip
					</button>
					<button
						type="button"
						onClick={save}
						disabled={saving}
						className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}

function Field({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className="block space-y-1">
			<span className="text-[10px] font-mono uppercase text-muted">
				{label}
			</span>
			<input
				type="number"
				min={0}
				value={value}
				placeholder=""
				onChange={(event) => onChange(event.target.value)}
				className="w-full px-2 py-2 text-sm border border-platinum rounded-lg bg-transparent font-mono"
			/>
		</label>
	);
}
