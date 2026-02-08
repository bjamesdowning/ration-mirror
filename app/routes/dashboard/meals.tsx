import { useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { EmptyPanel } from "~/components/dashboard/EmptyPanel";
import { PanelToolbar } from "~/components/dashboard/PanelToolbar";
import {
	GenerateMealButton,
	type GenerateMealButtonHandle,
} from "~/components/galley/GenerateMealButton";
import { MealGrid } from "~/components/galley/MealGrid";
import { MealQuickAdd } from "~/components/galley/MealQuickAdd";
import {
	ChefHatIcon,
	CloseIcon,
	PlusIcon,
	SearchIcon,
	SparkleIcon,
} from "~/components/icons/PageIcons";
import { DomainFilterChips } from "~/components/shell/DomainFilterChips";
import {
	type FloatingAction,
	FloatingActionBar,
} from "~/components/shell/FloatingActionBar";
import { MobilePageHeader } from "~/components/shell/MobilePageHeader";
import { TagFilterDropdown } from "~/components/shell/TagFilterDropdown";
import { usePageFilters } from "~/hooks/usePageFilters";
import { requireActiveGroup } from "~/lib/auth.server";
import type { ITEM_DOMAINS } from "~/lib/domain";
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
	const { meals, availableTags, inventory, activeMealIds } = loaderData;
	const [matchingEnabled, setMatchingEnabled] = useState(false);
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
	const [selectedMealIds, setSelectedMealIds] = useState(
		() => new Set(activeMealIds),
	);
	const clearFetcher = useFetcher<{ success: boolean; cleared: number }>();
	const generateRef = useRef<GenerateMealButtonHandle>(null);
	const {
		activeDomain,
		currentTag,
		handleDomainChange,
		handleTagChange,
		clearAllFilters,
		hasActiveFilters,
	} = usePageFilters({ extraActiveCheck: () => matchingEnabled });

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

	// FAB actions for mobile
	const fabActions: FloatingAction[] = [
		{
			id: showQuickAdd ? "cancel" : "add",
			icon: showQuickAdd ? <CloseIcon /> : <PlusIcon />,
			label: showQuickAdd ? "Cancel" : "Add Meal",
			variant: showQuickAdd ? "danger" : "default",
			onClick: () => setShowQuickAdd(!showQuickAdd),
		},
		{
			id: "generate",
			icon: <SparkleIcon />,
			label: "Generate",
			primary: true,
			onClick: () => {
				// Trigger the hidden GenerateMealButton
				generateRef.current?.open();
			},
		},
	];

	// Filter content for mobile sheet
	const filterContent = (
		<div className="space-y-6">
			{/* Match Mode toggle */}
			<div>
				<h4 className="text-sm font-medium text-muted mb-3">Match Mode</h4>
				<button
					type="button"
					onClick={() => setMatchingEnabled(!matchingEnabled)}
					className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-all ${
						matchingEnabled
							? "bg-hyper-green text-carbon"
							: "bg-platinum dark:bg-white/10 text-carbon dark:text-white"
					}`}
				>
					<span>Match with pantry ingredients</span>
					<span>{matchingEnabled ? "✓ On" : "Off"}</span>
				</button>
			</div>

			<DomainFilterChips
				activeDomain={activeDomain}
				onDomainChange={handleDomainChange}
			/>

			<TagFilterDropdown
				label="Recipe Tag"
				emptyLabel="All Recipes"
				currentTag={currentTag}
				availableTags={availableTags}
				onTagChange={handleTagChange}
			/>

			{/* Clear filters */}
			{hasActiveFilters && (
				<button
					type="button"
					onClick={() => {
						clearAllFilters();
						setMatchingEnabled(false);
					}}
					className="w-full py-3 text-center text-hyper-green font-medium hover:bg-hyper-green/10 rounded-xl transition-colors"
				>
					Clear All Filters
				</button>
			)}
		</div>
	);

	return (
		<>
			{/* Hidden instance for ref + modal (always in DOM, even on mobile) */}
			<GenerateMealButton ref={generateRef} className="hidden" />

			{/* Mobile Header */}
			<MobilePageHeader
				icon={<ChefHatIcon className="w-6 h-6 text-hyper-green" />}
				title="Galley"
				itemCount={filteredMeals.length}
				showSearch={true}
				searchPlaceholder="Search meals..."
				onSearchChange={setSearchQuery}
				filterContent={filterContent}
				hasActiveFilters={hasActiveFilters}
				onFilterOpenChange={setIsFilterSheetOpen}
			/>

			<div className="space-y-6">
				{/* Selection status bar */}
				{selectedCount > 0 && (
					<div className="glass-panel rounded-xl px-4 py-3 flex items-center justify-between">
						<div className="text-sm text-muted">
							<span className="text-carbon dark:text-white font-bold">
								{selectedCount}
							</span>{" "}
							meals selected for Supply list
						</div>
						<button
							type="button"
							onClick={handleClearSelections}
							className="text-xs font-bold px-3 py-2 border border-hyper-green text-hyper-green hover:bg-hyper-green/10 transition-all rounded-lg"
						>
							Clear All
						</button>
					</div>
				)}

				<div className="hidden md:block">
					<PanelToolbar
						primaryAction={
							<button
								type="button"
								onClick={() => generateRef.current?.open()}
								className="flex items-center gap-2 px-4 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all active:scale-95"
							>
								<SparkleIcon className="w-4 h-4" />
								Generate Meal
							</button>
						}
						quickAddPlaceholder="Add Meal"
						showQuickAdd={showQuickAdd}
						onToggleQuickAdd={() => setShowQuickAdd(!showQuickAdd)}
						quickAddForm={
							<MealQuickAdd
								onSuccess={() => setShowQuickAdd(false)}
								availableIngredients={inventory}
							/>
						}
					/>
				</div>

				{/* Mobile Quick Add Form */}
				{showQuickAdd && (
					<div className="glass-panel rounded-xl p-6 md:hidden animate-fade-in">
						<MealQuickAdd
							onSuccess={() => setShowQuickAdd(false)}
							availableIngredients={inventory}
						/>
					</div>
				)}

				{/* Empty State */}
				{filteredMeals.length === 0 && !searchQuery && (
					<EmptyPanel
						icon={<ChefHatIcon className="w-12 h-12 text-muted" />}
						title="No Recipes Yet"
						description="Create your first meal or let AI generate suggestions based on your pantry."
						action={
							<div className="flex flex-wrap justify-center gap-3">
								<button
									type="button"
									onClick={() => generateRef.current?.open()}
									className="px-6 py-3 bg-hyper-green text-carbon font-bold rounded-xl shadow-glow-sm hover:shadow-glow transition-all"
								>
									Generate Meal
								</button>
								<button
									type="button"
									onClick={() => setShowQuickAdd(true)}
									className="px-6 py-3 bg-platinum text-carbon font-medium rounded-xl hover:bg-platinum/80 transition-all"
								>
									Create Recipe
								</button>
							</div>
						}
					/>
				)}

				{/* No Search Results */}
				{filteredMeals.length === 0 && searchQuery && (
					<EmptyPanel
						icon={<SearchIcon className="w-12 h-12 text-muted" />}
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

			{/* Floating Action Bar (mobile only) */}
			<FloatingActionBar actions={fabActions} hidden={isFilterSheetOpen} />
		</>
	);
}
