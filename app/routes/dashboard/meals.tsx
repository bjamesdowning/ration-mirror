import { useMemo, useRef, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { EmptyPanel } from "~/components/dashboard/EmptyPanel";
import {
	GenerateMealButton,
	type GenerateMealButtonHandle,
} from "~/components/galley/GenerateMealButton";
import { MealGrid } from "~/components/galley/MealGrid";
import { MealQuickAdd } from "~/components/galley/MealQuickAdd";
import {
	ChefHatIcon,
	CloseIcon,
	SearchIcon,
} from "~/components/icons/PageIcons";
import { FilterChip } from "~/components/shell/FilterSheet";
import {
	type FloatingAction,
	FloatingActionBar,
} from "~/components/shell/FloatingActionBar";
import { MobilePageHeader } from "~/components/shell/MobilePageHeader";
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
	const generateRef = useRef<GenerateMealButtonHandle>(null);

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

	// Check if any filters are active
	const hasActiveFilters =
		activeDomain !== "all" || !!currentTag || matchingEnabled;

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

			{/* Domain filters */}
			<div>
				<h4 className="text-sm font-medium text-muted mb-3">Domain</h4>
				<div className="flex flex-wrap gap-2">
					<FilterChip
						label="All"
						isActive={activeDomain === "all"}
						onClick={() => handleDomainChange("all")}
					/>
					{ITEM_DOMAINS.map((domain) => {
						const Icon = DOMAIN_ICONS[domain];
						return (
							<FilterChip
								key={domain}
								label={DOMAIN_LABELS[domain]}
								icon={<Icon className="w-4 h-4" />}
								isActive={activeDomain === domain}
								onClick={() => handleDomainChange(domain)}
							/>
						);
					})}
				</div>
			</div>

			{/* Tag filter */}
			<div>
				<h4 className="text-sm font-medium text-muted mb-3">Recipe Tag</h4>
				<select
					id="tag-filter-mobile"
					value={currentTag || ""}
					onChange={handleTagChange}
					className="w-full bg-platinum dark:bg-white/10 border border-carbon/10 dark:border-white/10 px-4 py-3 rounded-xl text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
				>
					<option value="">All Recipes</option>
					{availableTags.map((tag) => (
						<option key={tag} value={tag}>
							{tag.charAt(0).toUpperCase() + tag.slice(1)}
						</option>
					))}
				</select>
			</div>

			{/* Clear filters */}
			{hasActiveFilters && (
				<button
					type="button"
					onClick={() => {
						handleDomainChange("all");
						setMatchingEnabled(false);
						const nextParams = new URLSearchParams(searchParams);
						nextParams.delete("tag");
						setSearchParams(nextParams);
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
			/>

			<div className="space-y-4">
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

				{/* Desktop Toolbar - hidden on mobile */}
				<div className="hidden md:flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={() => setShowQuickAdd(!showQuickAdd)}
						className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
							showQuickAdd
								? "bg-hyper-green text-carbon shadow-glow-sm"
								: "border-2 border-dashed border-carbon/20 text-muted hover:border-hyper-green hover:text-hyper-green"
						}`}
					>
						{showQuickAdd ? "✕ Cancel" : "+ Add Meal"}
					</button>

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
				</div>

				{/* Quick Add Form (collapsible) */}
				{showQuickAdd && (
					<div className="glass-panel rounded-xl p-6 animate-fade-in">
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
								<GenerateMealButton ref={generateRef} />
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

			<GenerateMealButton ref={generateRef} className="hidden md:flex" />
			{/* Floating Action Bar (mobile only) */}
			<FloatingActionBar actions={fabActions} />
		</>
	);
}

// --- Icon Components ---
function PlusIcon() {
	return (
		<svg
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M12 4v16m8-8H4"
			/>
		</svg>
	);
}

function SparkleIcon() {
	return (
		<svg
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
			/>
		</svg>
	);
}
