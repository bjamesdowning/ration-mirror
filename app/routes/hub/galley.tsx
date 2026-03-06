import { useMemo, useRef, useState } from "react";
import { useFetcher, useRouteLoaderData } from "react-router";
import { ViewToggle } from "~/components/common/ViewToggle";
import { AddTypeChoice } from "~/components/galley/AddTypeChoice";
import {
	GalleyImportButton,
	type GalleyImportButtonHandle,
} from "~/components/galley/GalleyImportButton";
import {
	GenerateMealButton,
	type GenerateMealButtonHandle,
} from "~/components/galley/GenerateMealButton";
import {
	ImportRecipeButton,
	type ImportRecipeButtonHandle,
} from "~/components/galley/ImportRecipeButton";
import { MealGrid } from "~/components/galley/MealGrid";
import { MealQuickAdd } from "~/components/galley/MealQuickAdd";
import { ProvisionQuickAdd } from "~/components/galley/ProvisionQuickAdd";
import { EmptyPanel } from "~/components/hub/EmptyPanel";
import { PanelToolbar } from "~/components/hub/PanelToolbar";
import {
	ChefHatIcon,
	CloseIcon,
	ExportIcon,
	ImportIcon,
	LinkIcon,
	PlusIcon,
	SearchIcon,
	SparkleIcon,
} from "~/components/icons/PageIcons";
import { ApiHint } from "~/components/shell/ApiHint";
import { CapacityIndicator } from "~/components/shell/CapacityIndicator";
import { DomainFilterChips } from "~/components/shell/DomainFilterChips";
import {
	type FloatingAction,
	FloatingActionBar,
} from "~/components/shell/FloatingActionBar";
import { PageHeader } from "~/components/shell/PageHeader";
import { PaginationBar } from "~/components/shell/PaginationBar";
import { TagFilterDropdown } from "~/components/shell/TagFilterDropdown";
import { UpgradePrompt } from "~/components/shell/UpgradePrompt";
import { usePageFilters } from "~/hooks/usePageFilters";
import { parseAllergens } from "~/lib/allergens";
import { requireActiveGroup } from "~/lib/auth.server";
import { getCargo } from "~/lib/cargo.server";
import type { ITEM_DOMAINS } from "~/lib/domain";
import { log } from "~/lib/logging.server";
import { getActiveMealSelections } from "~/lib/meal-selection.server";
import {
	getMeals,
	getMealsCount,
	getOrganizationMealTags,
} from "~/lib/meals.server";
import type { Route } from "./+types/galley";

type ItemDomain = (typeof ITEM_DOMAINS)[number];

const GALLEY_PAGE_SIZE = 100;
const GALLEY_INVENTORY_PAGE_SIZE = 200;

export async function loader({ request, context }: Route.LoaderArgs) {
	const { session, groupId } = await requireActiveGroup(context, request);
	const url = new URL(request.url);
	const tag = url.searchParams.get("tag") || undefined;
	const domain = url.searchParams.get("domain") || undefined;
	const page = Math.max(0, Number(url.searchParams.get("page") ?? "0"));

	// Parse user settings for view mode and allergens
	const rawSettings = session.user.settings;
	let defaultViewMode: "card" | "list" = "card";
	let userAllergens: ReturnType<typeof parseAllergens> = [];
	if (rawSettings) {
		try {
			const parsed =
				typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;
			if (parsed?.viewMode?.galley === "list") defaultViewMode = "list";
			userAllergens = parseAllergens(parsed?.allergens);
		} catch {}
	}

	const [meals, totalMeals, availableTags, inventory, activeSelections] =
		await Promise.all([
			getMeals(context.cloudflare.env.DB, groupId, tag, domain as ItemDomain, {
				limit: GALLEY_PAGE_SIZE,
				offset: page * GALLEY_PAGE_SIZE,
			}),
			getMealsCount(
				context.cloudflare.env.DB,
				groupId,
				tag,
				domain as ItemDomain | undefined,
			),
			getOrganizationMealTags(context.cloudflare.env.DB, groupId),
			getCargo(context.cloudflare.env.DB, groupId, undefined, {
				limit: GALLEY_INVENTORY_PAGE_SIZE,
				offset: 0,
			}),
			getActiveMealSelections(context.cloudflare.env.DB, groupId),
		]);
	const activeMealIds = activeSelections.map((selection) => selection.mealId);
	return {
		meals,
		totalMeals,
		availableTags,
		currentTag: tag,
		currentDomain: domain,
		inventory,
		activeMealIds,
		page,
		pageSize: GALLEY_PAGE_SIZE,
		defaultViewMode,
		userAllergens,
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
			log.error("Update failed", error);
			return { success: false, error: "Validation failed" };
		}
	}

	return { success: false, error: "Unknown Intent" };
}

export default function MealsIndex({ loaderData }: Route.ComponentProps) {
	const {
		meals,
		totalMeals,
		availableTags,
		inventory,
		activeMealIds,
		page,
		pageSize,
		defaultViewMode,
		userAllergens,
	} = loaderData;
	const dashboardData = useRouteLoaderData("routes/hub") as {
		balance?: number;
		aiCosts?: { MEAL_GENERATE: number; IMPORT_URL: number };
		capacity?: {
			meals?: { current: number; limit: number };
		};
	} | null;
	type AddStep = null | "choice" | "recipe" | "provision";
	const [addStep, setAddStep] = useState<AddStep>(null);
	const [matchingEnabled, setMatchingEnabled] = useState(false);
	const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
	const [viewMode, setViewMode] = useState<"card" | "list">(
		defaultViewMode ?? "card",
	);
	const [selectedMealIds, setSelectedMealIds] = useState(
		() => new Set(activeMealIds),
	);
	const clearFetcher = useFetcher<{ success: boolean; cleared: number }>();
	const generateRef = useRef<GenerateMealButtonHandle>(null);
	const importRef = useRef<ImportRecipeButtonHandle>(null);
	const galleyImportRef = useRef<GalleyImportButtonHandle>(null);
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
			id: addStep !== null ? "cancel" : "add",
			icon: addStep !== null ? <CloseIcon /> : <PlusIcon />,
			label: addStep !== null ? "Cancel" : "Add",
			variant: addStep !== null ? "danger" : "default",
			onClick: () =>
				addStep !== null ? setAddStep(null) : setAddStep("choice"),
		},
		{
			id: "import-json",
			icon: <ImportIcon />,
			label: "Import JSON",
			onClick: () => galleyImportRef.current?.openImport(),
		},
		{
			id: "export",
			icon: <ExportIcon />,
			label: "Export",
			onClick: () => {
				window.location.href = "/api/galley/export";
			},
		},
		{
			id: "import-url",
			icon: <LinkIcon />,
			label: "Import URL",
			variant: "primary",
			onClick: () => importRef.current?.open(),
		},
		{
			id: "generate",
			icon: <SparkleIcon />,
			label: "Generate",
			primary: true,
			onClick: () => {
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
					<span>Match with Cargo items</span>
					<span>{matchingEnabled ? "On" : "Off"}</span>
				</button>
			</div>

			<DomainFilterChips
				activeDomain={activeDomain}
				onDomainChange={handleDomainChange}
			/>

			<TagFilterDropdown
				label="Meal Tag"
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
			<UpgradePrompt
				open={showUpgradePrompt}
				onClose={() => setShowUpgradePrompt(false)}
				title="Meal capacity reached"
				description={`You've reached the free plan limit of ${dashboardData?.capacity?.meals?.limit ?? 15} meals. Upgrade to Crew Member for unlimited meals.`}
			/>

			{/* Hidden instances for ref + modal (always in DOM, even on mobile) */}
			<GenerateMealButton
				ref={generateRef}
				className="hidden"
				credits={dashboardData?.balance}
				costPerGenerate={dashboardData?.aiCosts?.MEAL_GENERATE}
			/>
			<GalleyImportButton
				ref={galleyImportRef}
				onImportComplete={() => {}}
				className="hidden"
			/>
			<ImportRecipeButton
				ref={importRef}
				className="hidden"
				credits={dashboardData?.balance}
				costPerImport={dashboardData?.aiCosts?.IMPORT_URL}
			/>

			{/* Mobile Header */}
			<PageHeader
				icon={<ChefHatIcon className="w-6 h-6 text-hyper-green" />}
				title="Galley"
				itemCount={totalMeals}
				showSearch={true}
				searchPlaceholder="Search meals..."
				onSearchChange={setSearchQuery}
				filterContent={filterContent}
				hasActiveFilters={hasActiveFilters}
				onFilterOpenChange={setIsFilterSheetOpen}
				titleRowExtra={
					<ViewToggle
						page="galley"
						currentMode={viewMode}
						onToggle={setViewMode}
					/>
				}
			/>
			{dashboardData?.capacity?.meals &&
				dashboardData.capacity.meals.limit !== -1 && (
					<CapacityIndicator
						label="Meals"
						current={dashboardData.capacity.meals.current}
						limit={dashboardData.capacity.meals.limit}
					/>
				)}

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
						secondaryAction={
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => galleyImportRef.current?.openImport()}
									className="flex items-center gap-2 px-4 py-3 bg-platinum text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
								>
									<ImportIcon className="w-4 h-4" />
									Import JSON
								</button>
								<a
									href="/api/galley/export"
									download="ration-galley.json"
									className="flex items-center gap-2 px-4 py-3 bg-platinum text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
								>
									<ExportIcon className="w-4 h-4" />
									Export JSON
								</a>
								<button
									type="button"
									onClick={() => importRef.current?.open()}
									className="flex items-center gap-2 px-4 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all active:scale-95"
								>
									<LinkIcon className="w-4 h-4" />
									Import URL
								</button>
								<ApiHint variant="icon" />
							</div>
						}
						quickAddPlaceholder="Add"
						showQuickAdd={addStep !== null}
						onToggleQuickAdd={() => {
							if (addStep !== null) {
								setAddStep(null);
							} else {
								setAddStep("choice");
							}
						}}
						quickAddForm={
							addStep === "choice" ? (
								<AddTypeChoice
									onSelectRecipe={() => setAddStep("recipe")}
									onSelectItem={() => setAddStep("provision")}
								/>
							) : addStep === "provision" ? (
								<ProvisionQuickAdd
									defaultDomain={activeDomain !== "all" ? activeDomain : "food"}
									onSuccess={() => setAddStep(null)}
									onUpgradeRequired={() => {
										setAddStep(null);
										setShowUpgradePrompt(true);
									}}
								/>
							) : addStep === "recipe" ? (
								<MealQuickAdd
									onSuccess={() => setAddStep(null)}
									onUpgradeRequired={() => {
										setAddStep(null);
										setShowUpgradePrompt(true);
									}}
									availableIngredients={inventory}
								/>
							) : null
						}
					/>
				</div>

				{/* Mobile Quick Add: choice step or form */}
				{addStep !== null && (
					<div className="glass-panel rounded-xl p-6 md:hidden animate-fade-in">
						{addStep === "choice" ? (
							<AddTypeChoice
								onSelectRecipe={() => setAddStep("recipe")}
								onSelectItem={() => setAddStep("provision")}
							/>
						) : addStep === "provision" ? (
							<ProvisionQuickAdd
								defaultDomain={activeDomain !== "all" ? activeDomain : "food"}
								onSuccess={() => setAddStep(null)}
								onUpgradeRequired={() => {
									setAddStep(null);
									setShowUpgradePrompt(true);
								}}
							/>
						) : (
							<MealQuickAdd
								onSuccess={() => setAddStep(null)}
								onUpgradeRequired={() => {
									setAddStep(null);
									setShowUpgradePrompt(true);
								}}
								availableIngredients={inventory}
							/>
						)}
					</div>
				)}

				{/* Empty State */}
				{filteredMeals.length === 0 && !searchQuery && (
					<EmptyPanel
						icon={<ChefHatIcon className="w-12 h-12 text-muted" />}
						title="No Meals Yet"
						description="Create your first meal or let AI generate suggestions based on your Cargo."
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
									onClick={() => importRef.current?.open()}
									className="px-6 py-3 bg-hyper-green text-carbon font-bold rounded-xl shadow-glow-sm hover:shadow-glow transition-all"
								>
									Import Meal
								</button>
								<button
									type="button"
									onClick={() => setAddStep("choice")}
									className="px-6 py-3 bg-platinum text-carbon font-medium rounded-xl hover:bg-platinum/80 transition-all"
								>
									Add
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

				{/* Meal Grid / List */}
				{filteredMeals.length > 0 && (
					<>
						<MealGrid
							meals={filteredMeals}
							enableMatching={matchingEnabled}
							inventory={inventory}
							activeMealIds={selectedMealIds}
							onToggleMealActive={handleToggleActive}
							viewMode={viewMode}
							userAllergens={userAllergens}
						/>
						{totalMeals > pageSize && (
							<PaginationBar
								currentPage={page}
								totalItems={totalMeals}
								pageSize={pageSize}
								itemLabel="meals"
							/>
						)}
					</>
				)}
			</div>

			{/* Floating Action Bar (mobile only) */}
			<FloatingActionBar actions={fabActions} hidden={isFilterSheetOpen} />
		</>
	);
}
