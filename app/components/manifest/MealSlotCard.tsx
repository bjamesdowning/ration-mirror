import { Link, useFetcher } from "react-router";
import {
	CheckIcon,
	ClockIcon,
	ConsumeIcon,
} from "~/components/icons/PageIcons";
import { AllergenWarningBadge } from "~/components/shared/AllergenWarningBadge";
import type { AllergenSlug } from "~/lib/allergens";
import type { MealPlanEntryWithMeal } from "~/lib/manifest.server";

interface MealSlotCardProps {
	entry: MealPlanEntryWithMeal;
	planId: string;
	readOnly?: boolean;
	/** legacy: existing Eat/consume flow. split: Cook/Log-split (nutrition-cook-log-split). */
	mode?: "legacy" | "split";
	onConsume?: (entryId: string) => void;
	onCopy?: (entry: MealPlanEntryWithMeal) => void;
	isConsuming?: boolean;
	/** Allergens triggered by this meal's ingredients (pre-computed in loader). */
	triggeredAllergens?: AllergenSlug[];
	/** Whether this meal currently has all required ingredients in cargo. */
	isReady?: boolean;
	mealTags?: string[];
	/** Label for the split-mode Cook button/aria-text (e.g. "Cook"). */
	consumeLabel?: string;
	/** split mode — opens the private "Log my serving" dialog. */
	onEat?: (entryId: string) => void;
	/** split mode — opens the private dialog pre-filled with the existing log. */
	onEditServing?: (entryId: string) => void;
}

function formatServingsCount(value: number): string {
	return value % 1 === 0 ? String(value) : value.toFixed(1);
}

export function MealSlotCard({
	entry,
	planId,
	readOnly = false,
	mode = "legacy",
	onConsume,
	onCopy,
	isConsuming = false,
	triggeredAllergens = [],
	isReady,
	mealTags = [],
	consumeLabel = "Cook",
	onEat,
	onEditServing,
}: MealSlotCardProps) {
	const fetcher = useFetcher();
	const isRemoving = fetcher.state !== "idle";
	const isSplit = mode === "split";
	const isConsumedLegacy = !!entry.consumedAt;
	const isPrepared = isSplit && !!(entry.cookedAt ?? entry.consumedAt);
	const personalIntake = entry.personalIntake ?? null;
	// Split mode never strikes through the meal name — "Prepared" is a shared
	// state, not a personal completion marker.
	const showDoneStyling = isSplit ? isPrepared : isConsumedLegacy;
	const canCook = isSplit && !readOnly && !isPrepared && !!onConsume;
	const canConsumeLegacy =
		!isSplit && !readOnly && !isConsumedLegacy && !!onConsume;

	const totalMinutes = (entry.mealPrepTime ?? 0) + (entry.mealCookTime ?? 0);

	const handleRemove = () => {
		fetcher.submit(null, {
			method: "DELETE",
			action: `/api/meal-plans/${planId}/entries/${entry.id}`,
		});
	};

	const handlePrimaryAction = () => {
		if (isConsuming) return;
		if (isSplit) {
			if (!canCook) return;
			onConsume?.(entry.id);
		} else {
			if (!canConsumeLegacy) return;
			onConsume?.(entry.id);
		}
	};

	const effectiveServings = entry.servingsOverride ?? entry.mealServings;

	return (
		<div
			className={`group relative flex items-start justify-between rounded-xl border px-3 py-2.5 transition-all ${
				showDoneStyling
					? "bg-hyper-green/5 border-hyper-green/20"
					: "bg-white/60 dark:bg-carbon/5 border-platinum hover:border-platinum/80 hover:shadow-sm"
			} ${isRemoving ? "opacity-40 scale-95" : ""}`}
		>
			<div className="flex-1 min-w-0 pr-2">
				{/* Meal name as a link */}
				{readOnly ? (
					<p
						className={`text-sm font-semibold capitalize leading-snug ${
							!isSplit && isConsumedLegacy
								? "text-muted line-through"
								: "text-carbon"
						}`}
					>
						{entry.mealName}
					</p>
				) : (
					<Link
						to={`/hub/galley/${entry.mealId}`}
						className={`block text-sm font-semibold capitalize leading-snug transition-colors ${
							!isSplit && isConsumedLegacy
								? "text-muted line-through"
								: "text-carbon hover:text-hyper-green"
						}`}
					>
						{entry.mealName}
					</Link>
				)}

				{/* Servings + time badge row */}
				<div className="flex items-center gap-2 mt-0.5 flex-wrap">
					<p className="text-xs text-muted font-mono">
						{entry.mealType === "provision" ? (
							<>
								×{effectiveServings}
								{entry.servingsOverride ? " (custom)" : ""}
							</>
						) : (
							<>
								{effectiveServings}{" "}
								{effectiveServings === 1 ? "serving" : "servings"}
								{entry.servingsOverride ? " (custom)" : ""}
							</>
						)}
					</p>
					{totalMinutes > 0 && !showDoneStyling && (
						<span className="flex items-center gap-0.5 text-[10px] text-muted font-mono">
							<ClockIcon className="w-3 h-3 shrink-0" />
							{totalMinutes}m
						</span>
					)}
					{!showDoneStyling && isReady !== undefined && (
						<span
							className={`inline-block h-1.5 w-1.5 rounded-full ${
								isReady ? "bg-hyper-green" : "bg-amber-400"
							}`}
							title={
								isReady ? "All ingredients available" : "Missing ingredients"
							}
						/>
					)}
				</div>

				{triggeredAllergens.length > 0 && (
					<div className="mt-1.5">
						<AllergenWarningBadge triggered={triggeredAllergens} compact />
					</div>
				)}

				{mealTags.length > 0 && (
					<div className="flex flex-wrap gap-1 mt-1.5">
						{mealTags.slice(0, 4).map((tag) => (
							<span
								key={tag}
								className="text-[10px] px-1.5 py-0.5 rounded-full bg-platinum/80 dark:bg-white/10 text-muted font-mono"
							>
								{tag}
							</span>
						))}
					</div>
				)}

				{entry.notes && (
					<p className="text-xs text-muted mt-1 italic truncate">
						{entry.notes}
					</p>
				)}

				{isSplit && isPrepared && personalIntake && (
					<p className="text-[11px] font-mono text-hyper-green mt-1.5">
						You logged {formatServingsCount(personalIntake.servings)}{" "}
						{personalIntake.servings === 1 ? "serving" : "servings"}
					</p>
				)}
			</div>

			<div className="flex flex-col items-end gap-1.5 shrink-0">
				{isSplit ? (
					isPrepared ? (
						<>
							<span
								className="flex items-center gap-1 text-[10px] font-semibold text-hyper-green bg-hyper-green/10 px-1.5 py-0.5 rounded-full"
								role="img"
								aria-label="Prepared"
							>
								<CheckIcon className="w-3 h-3" />
								Prepared
							</span>
							{!readOnly && personalIntake && onEditServing && (
								<button
									type="button"
									onClick={() => onEditServing(entry.id)}
									aria-label={`Edit serving for ${entry.mealName}`}
									className="text-[10px] font-mono font-semibold px-2 py-1 rounded-lg border border-platinum text-muted hover:text-hyper-green hover:border-hyper-green/50 transition-colors"
								>
									Edit serving
								</button>
							)}
							{!readOnly && !personalIntake && onEat && (
								<button
									type="button"
									onClick={() => onEat(entry.id)}
									aria-label={`Log my serving for ${entry.mealName}`}
									className="text-[10px] font-mono font-semibold px-2 py-1 rounded-lg bg-hyper-green/10 text-hyper-green hover:bg-hyper-green/20 transition-colors"
								>
									Log my serving
								</button>
							)}
						</>
					) : (
						<div className="flex items-center gap-1">
							{canCook && (
								<button
									type="button"
									onClick={handlePrimaryAction}
									disabled={isConsuming}
									aria-label={`${consumeLabel} ${entry.mealName} (deduct from Cargo)`}
									className="p-2 min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-hyper-green hover:bg-hyper-green/10 transition-all disabled:opacity-50 flex items-center justify-center"
								>
									<ConsumeIcon className="w-4 h-4" />
								</button>
							)}
							{!readOnly && onCopy && (
								<button
									type="button"
									onClick={() => onCopy(entry)}
									aria-label={`Copy ${entry.mealName} to other days`}
									className="p-2 min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-hyper-green hover:bg-hyper-green/10 transition-all md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 flex items-center justify-center"
								>
									<svg
										className="w-3.5 h-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<title>Copy to other days</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
								</button>
							)}
							{!readOnly && (
								<button
									type="button"
									onClick={handleRemove}
									disabled={isRemoving}
									aria-label={`Remove ${entry.mealName}`}
									className="p-2 min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-all md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 flex items-center justify-center"
								>
									<svg
										className="w-3.5 h-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<title>Remove</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							)}
						</div>
					)
				) : isConsumedLegacy ? (
					<span
						className="flex items-center gap-1 text-[10px] font-semibold text-hyper-green bg-hyper-green/10 px-1.5 py-0.5 rounded-full"
						role="img"
						aria-label="Consumed"
					>
						<CheckIcon className="w-3 h-3" />
						Done
					</span>
				) : (
					<div className="flex items-center gap-1">
						{canConsumeLegacy && (
							<button
								type="button"
								onClick={handlePrimaryAction}
								disabled={isConsuming}
								aria-label={`Consume ${entry.mealName} (deduct from Cargo)`}
								className="p-2 min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-hyper-green hover:bg-hyper-green/10 transition-all disabled:opacity-50 flex items-center justify-center"
							>
								<ConsumeIcon className="w-4 h-4" />
							</button>
						)}
						{!readOnly && onCopy && !isConsumedLegacy && (
							<button
								type="button"
								onClick={() => onCopy(entry)}
								aria-label={`Copy ${entry.mealName} to other days`}
								className="p-2 min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-hyper-green hover:bg-hyper-green/10 transition-all md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 flex items-center justify-center"
							>
								<svg
									className="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<title>Copy to other days</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
							</button>
						)}
						{!readOnly && (
							<button
								type="button"
								onClick={handleRemove}
								disabled={isRemoving}
								aria-label={`Remove ${entry.mealName}`}
								className="p-2 min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-all md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 flex items-center justify-center"
							>
								<svg
									className="w-3.5 h-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<title>Remove</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
