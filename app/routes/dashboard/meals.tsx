import { useMemo, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { EmptyPanel } from "~/components/dashboard/EmptyPanel";
import { PanelToolbar } from "~/components/dashboard/PanelToolbar";
import { GenerateMealButton } from "~/components/galley/GenerateMealButton";
import { MealGrid } from "~/components/galley/MealGrid";
import { MealQuickAdd } from "~/components/galley/MealQuickAdd";
import { requireActiveGroup } from "~/lib/auth.server";
import { DOMAIN_ICONS, DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import { getInventory } from "~/lib/inventory.server";
import { getActiveMealSelections } from "~/lib/meal-selection.server";
import { getMeals, getOrganizationMealTags } from "~/lib/meals.server";
import type { Route } from "./+types/meals";

type ItemDomain = (typeof ITEM_DOMAINS)[number];

export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const url = new URL(request.url);
	const tag = url.searchParams.get("tag") || undefined;
	const domain = url.searchParams.get("domain") || undefined;

	const [meals, availableTags, inventory, activeSelections] = await Promise.all(
		[
			getMeals(context.cloudflare.env.DB, groupId, tag, domain as ItemDomain),
			getOrganizationMealTags(context.cloudflare.env.DB, groupId),
			getInventory(context.cloudflare.env.DB, groupId),
			getActiveMealSelections(context.cloudflare.env.DB, groupId),
		],
	);
	const activeMealIds = activeSelections.map((selection) => selection.mealId);
	return {
		meals,
		availableTags,
		currentTag: tag,
		currentDomain: domain,
		inventory,
		activeMealIds,
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const formData = await request.formData();
	const intent = formData.get("intent");

	if (intent === "delete") {
		const mealId = formData.get("mealId") as string;
		if (!mealId) return { success: false, error: "Missing Meal ID" };

		const { deleteMeal } = await import("~/lib/meals.server");
		await deleteMeal(context.cloudflare.env.DB, groupId, mealId);
		return { success: true };
	}

	if (intent === "update") {
		const mealId = formData.get("mealId") as string;
		if (!mealId) return { success: false, error: "Missing Meal ID" };

		const { updateMeal } = await import("~/lib/meals.server");
		const { MealSchema } = await import("~/lib/schemas/meal");
		const { parseFormData } = await import("~/lib/form-utils");

		try {
			// Need to convert FormData to JSON object for Zod validation
			// We can use the logic from meals.$id.edit.tsx
			const inputData = parseFormData(formData);

			// Remove intent and mealId from inputData before validation if they are not in schema
			// Schema might be strict.

			const input = MealSchema.parse(inputData);
			await updateMeal(context.cloudflare.env.DB, groupId, mealId, input);
			return { success: true };
		} catch (error) {
			console.error("Update failed", error);
			return { success: false, error: "Validation failed" };
		}
	}

	return { success: false, error: "Unknown Intent" };
}

export default function MealsIndex({ loaderData }: Route.ComponentProps) {
	const {
		meals,
		availableTags,
		currentTag,
		currentDomain,
		inventory,
		activeMealIds,
	} = loaderData;
	const [searchParams, setSearchParams] = useSearchParams();
	const [matchingEnabled, setMatchingEnabled] = useState(false);
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedMealIds, setSelectedMealIds] = useState(
		() => new Set(activeMealIds),
	);
	const clearFetcher = useFetcher<{ success: boolean; cleared: number }>();

	const handleTagChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const selectedTag = e.target.value;
		const nextParams = new URLSearchParams(searchParams);
		if (selectedTag) {
			nextParams.set("tag", selectedTag);
		} else {
			nextParams.delete("tag");
		}
		setSearchParams(nextParams);
	};

	const activeDomainParam =
		currentDomain || searchParams.get("domain") || "all";
	const activeDomain = ITEM_DOMAINS.includes(activeDomainParam as ItemDomain)
		? (activeDomainParam as ItemDomain)
		: "all";

	const handleDomainChange = (nextDomain: ItemDomain | "all") => {
		const nextParams = new URLSearchParams(searchParams);
		if (nextDomain === "all") {
			nextParams.delete("domain");
		} else {
			nextParams.set("domain", nextDomain);
		}
		setSearchParams(nextParams);
	};

	// Local search filtering (client-side for speed, no credits)
	const filteredMeals = useMemo(() => {
		let filtered = meals;
		if (activeDomain !== "all") {
			filtered = filtered.filter((meal) => meal.domain === activeDomain);
		}
		if (!searchQuery.trim()) return filtered;
		const query = searchQuery.toLowerCase();
		return filtered.filter(
			(meal) =>
				meal.name.toLowerCase().includes(query) ||
				meal.description?.toLowerCase().includes(query) ||
				meal.tags?.some((tag) => tag.toLowerCase().includes(query)),
		);
	}, [meals, searchQuery, activeDomain]);

	const selectedCount = selectedMealIds.size;

	const handleToggleActive = (mealId: string, nextActive: boolean) => {
		setSelectedMealIds((prev) => {
			const next = new Set(prev);
			if (nextActive) {
				next.add(mealId);
			} else {
				next.delete(mealId);
			}
			return next;
		});
	};

	const handleClearSelections = () => {
		setSelectedMealIds(new Set());
		clearFetcher.submit(null, {
			method: "post",
			action: "/api/meals/clear-selections",
		});
	};

	return (
		<>
			<DashboardHeader
				title="Galley"
				subtitle="Recipe Database // Intel"
				showSearch={true}
				totalItems={filteredMeals.length}
				searchPlaceholder="Search meals..."
				onSearchChange={setSearchQuery}
			/>

			<div className="space-y-6">
				<div className="glass-panel rounded-xl px-4 py-3 flex items-center justify-between">
					<div className="text-sm text-muted">
						<span className="text-carbon font-bold">{selectedCount}</span> meals
						selected for Supply list
					</div>
					<button
						type="button"
						onClick={handleClearSelections}
						disabled={selectedCount === 0}
						className={`text-xs font-bold px-3 py-2 border transition-all ${
							selectedCount > 0
								? "border-hyper-green text-hyper-green hover:bg-hyper-green/10"
								: "border-carbon/20 text-muted cursor-not-allowed"
						}`}
					>
						Clear All
					</button>
				</div>
				{/* Unified Toolbar */}
				<PanelToolbar
					primaryAction={<GenerateMealButton />}
					quickAddPlaceholder="Quick Add Meal"
					showQuickAdd={showQuickAdd}
					onToggleQuickAdd={() => setShowQuickAdd(!showQuickAdd)}
					quickAddForm={
						<MealQuickAdd
							onSuccess={() => setShowQuickAdd(false)}
							availableIngredients={inventory}
						/>
					}
					filterControls={
						<div className="flex flex-wrap items-center gap-3">
							{/* Match Mode Toggle */}
							<button
								type="button"
								onClick={() => setMatchingEnabled(!matchingEnabled)}
								className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
									matchingEnabled
										? "bg-hyper-green text-carbon shadow-glow-sm"
										: "bg-platinum text-carbon hover:bg-platinum/80"
								}`}
							>
								{matchingEnabled ? "✓ Match Mode" : "Match Mode"}
							</button>

							<div className="flex items-center gap-2">
								<span className="text-xs text-muted font-medium">Domain:</span>
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										onClick={() => handleDomainChange("all")}
										className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
											activeDomain === "all"
												? "bg-hyper-green text-carbon"
												: "bg-platinum text-carbon hover:bg-platinum/80"
										}`}
									>
										All
									</button>
									{ITEM_DOMAINS.map((domain) => (
										<button
											key={domain}
											type="button"
											onClick={() => handleDomainChange(domain)}
											className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
												activeDomain === domain
													? "bg-hyper-green text-carbon"
													: "bg-platinum text-carbon hover:bg-platinum/80"
											}`}
										>
											{DOMAIN_ICONS[domain]} {DOMAIN_LABELS[domain]}
										</button>
									))}
								</div>
							</div>

							{/* Tag Filter */}
							<label
								htmlFor="tag-filter"
								className="text-xs text-muted font-medium"
							>
								Filter:
							</label>
							<select
								id="tag-filter"
								value={currentTag || ""}
								onChange={handleTagChange}
								className="bg-platinum border border-carbon/10 px-3 py-2 rounded-lg text-sm text-carbon focus:outline-none focus:ring-2 focus:ring-hyper-green/50 cursor-pointer"
							>
								<option value="">All Recipes</option>
								{availableTags.map((tag) => (
									<option key={tag} value={tag}>
										{tag.charAt(0).toUpperCase() + tag.slice(1)}
									</option>
								))}
							</select>
							{currentTag && (
								<Link
									to="/dashboard/meals"
									className="text-xs text-hyper-green hover:text-hyper-green/80 transition-colors"
								>
									Clear
								</Link>
							)}
						</div>
					}
				/>

				{/* Empty State */}
				{filteredMeals.length === 0 && !searchQuery && (
					<EmptyPanel
						icon="🍽️"
						title="No Recipes Yet"
						description="Create your first meal or let AI generate suggestions based on your pantry inventory."
						action={
							<>
								<GenerateMealButton />
								<button
									type="button"
									onClick={() => setShowQuickAdd(true)}
									className="px-6 py-3 bg-platinum text-carbon font-medium rounded-xl hover:bg-platinum/80 transition-all"
								>
									Create Recipe
								</button>
							</>
						}
					/>
				)}

				{/* No Search Results */}
				{filteredMeals.length === 0 && searchQuery && (
					<EmptyPanel
						icon="🔍"
						title="No Results"
						description={`No meals found matching "${searchQuery}"`}
						className="py-12"
					/>
				)}

				{/* Meal Grid */}
				{filteredMeals.length > 0 && (
					<MealGrid
						meals={filteredMeals}
						enableMatching={matchingEnabled}
						inventory={inventory}
						activeMealIds={selectedMealIds}
						onToggleMealActive={handleToggleActive}
					/>
				)}
			</div>
		</>
	);
}
