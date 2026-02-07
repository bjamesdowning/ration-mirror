import { useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { PanelToolbar } from "~/components/dashboard/PanelToolbar";
import { CloseIcon, ShoppingBagIcon } from "~/components/icons/PageIcons";
import { FilterChip } from "~/components/shell/FilterSheet";
import {
	type FloatingAction,
	FloatingActionBar,
} from "~/components/shell/FloatingActionBar";
import { MobilePageHeader } from "~/components/shell/MobilePageHeader";
import { AddItemForm } from "~/components/supply/AddItemForm";
import { GroceryList } from "~/components/supply/GroceryList";
import type { groceryItem, groceryList } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { DOMAIN_ICONS, DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import {
	completeGroceryList,
	createGroceryListFromSelectedMeals,
} from "~/lib/grocery.server";
import { getActiveMealSelections } from "~/lib/meal-selection.server";

type GroceryListWithItems = typeof groceryList.$inferSelect & {
	items: (typeof groceryItem.$inferSelect)[];
};

type ItemDomain = (typeof ITEM_DOMAINS)[number];

export async function loader({ request, context }: LoaderFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	// Auto-sync: Always ensure we have a list and it's up to date with missing meal ingredients
	// This fulfills: "when the supply page is opened, it should automatically update"
	const { list } = await createGroceryListFromSelectedMeals(
		context.cloudflare.env.DB,
		groupId,
	);
	const activeSelections = await getActiveMealSelections(
		context.cloudflare.env.DB,
		groupId,
	);

	// Fetch available tags for filtering
	const { getOrganizationInventoryTags } = await import(
		"~/lib/inventory.server"
	);
	const availableTags = await getOrganizationInventoryTags(
		context.cloudflare.env.DB,
		groupId,
	);

	return {
		list,
		activeSelectionCount: activeSelections.length,
		availableTags,
	};
}

export async function action({ request, context }: ActionFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const formData = await request.formData();
	const intent = formData.get("intent");

	// Manual Update / Refresh
	if (intent === "update-list") {
		const result = await createGroceryListFromSelectedMeals(
			context.cloudflare.env.DB,
			groupId,
		);
		return { list: result.list, summary: result.summary };
	}

	// Dock Cargo (Complete List / Move purchased to inventory)
	if (intent === "dock-cargo") {
		const listId = formData.get("listId") as string;
		if (!listId) return { error: "Missing List ID" };

		const result = await completeGroceryList(
			context.cloudflare.env.DB,
			groupId,
			listId,
		);
		return { success: true, docked: result.docked };
	}

	return { error: "Invalid intent" };
}

export default function GroceryDashboard() {
	const { list, activeSelectionCount } = useLoaderData<{
		list: GroceryListWithItems;
		activeSelectionCount: number;
	}>();
	const fetcher = useFetcher(); // For update list
	const dockFetcher = useFetcher(); // For docking
	const revalidator = useRevalidator();
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [showSummary, setShowSummary] = useState(false);
	const [domainFilter, setDomainFilter] = useState<ItemDomain | "all">("all");
	const [searchQuery, setSearchQuery] = useState("");

	// Local Search Logic (matches Cargo/Galley pattern)
	const filteredItems = useMemo(() => {
		if (!list?.items) return [];
		let items = list.items;

		// Filter by Domain
		if (domainFilter !== "all") {
			items = items.filter((item) => item.domain === domainFilter);
		}

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			items = items.filter((item) => item.name.toLowerCase().includes(query));
		}

		return items;
	}, [list?.items, searchQuery, domainFilter]);

	// Filter content for mobile sheet
	const filterContent = (
		<div className="space-y-6">
			{/* Domain filters */}
			<div>
				<h4 className="text-sm font-medium text-muted mb-3">Domain</h4>
				<div className="flex flex-wrap gap-2">
					<FilterChip
						label="All"
						isActive={domainFilter === "all"}
						onClick={() => setDomainFilter("all")}
					/>
					{ITEM_DOMAINS.map((domain) => {
						const Icon = DOMAIN_ICONS[domain];
						return (
							<FilterChip
								key={domain}
								label={DOMAIN_LABELS[domain]}
								icon={<Icon className="w-4 h-4" />}
								isActive={domainFilter === domain}
								onClick={() => setDomainFilter(domain)}
							/>
						);
					})}
				</div>
			</div>

			{/* Clear filters */}
			{domainFilter !== "all" && (
				<button
					type="button"
					onClick={() => setDomainFilter("all")}
					className="w-full py-3 text-center text-hyper-green font-medium hover:bg-hyper-green/10 rounded-xl transition-colors"
				>
					Clear All Filters
				</button>
			)}
		</div>
	);

	const isDocking = dockFetcher.state !== "idle";

	// Calculate purchased count for Dock button state
	const purchasedCount = list?.items?.filter((i) => i.isPurchased).length || 0;

	const handleDockCargo = () => {
		if (purchasedCount === 0) return;
		if (
			!confirm(
				`Ready to transfer ${purchasedCount} purchased items to your pantry?`,
			)
		)
			return;

		dockFetcher.submit(
			{ intent: "dock-cargo", listId: list.id },
			{ method: "POST" },
		);
	};

	// Show summary toast when auto-update or manual update occurs with new items?
	// Loader auto-updates but doesn't return summary easily to the component unless we pass it.
	// For manual update, we get it in fetcher.data.
	if (fetcher.data?.summary && !showSummary) {
		setShowSummary(true);
		setTimeout(() => setShowSummary(false), 5000);
	}

	// Show dock success
	const [showDockSuccess, setShowDockSuccess] = useState(false);
	if (dockFetcher.data?.success && !showDockSuccess) {
		setShowDockSuccess(true);
		setTimeout(() => setShowDockSuccess(false), 4000);
	}

	// FAB actions for mobile
	const fabActions: FloatingAction[] = [
		{
			id: showQuickAdd ? "cancel" : "add",
			icon: showQuickAdd ? (
				<CloseIcon className="w-6 h-6" />
			) : (
				<svg
					className="w-6 h-6"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					role="img"
					aria-labelledby="add-item-icon"
				>
					<title id="add-item-icon">Add Item</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M12 4v16m8-8H4"
					/>
				</svg>
			),
			label: showQuickAdd ? "Cancel" : "Add Item",
			variant: showQuickAdd ? "danger" : "default",
			onClick: () => setShowQuickAdd(!showQuickAdd),
		},
		{
			id: "dock",
			icon: (
				<svg
					className="w-6 h-6"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					role="img"
					aria-labelledby="dock-cargo-icon"
				>
					<title id="dock-cargo-icon">Add to Cargo</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M5 13l4 4L19 7"
					/>
				</svg>
			),
			label: "Add to Cargo",
			primary: true,
			onClick: handleDockCargo,
			disabled: isDocking || purchasedCount === 0,
		},
	];

	return (
		<>
			{/* Mobile Header */}
			<MobilePageHeader
				icon={<ShoppingBagIcon className="w-6 h-6 text-hyper-green" />}
				title="Supply"
				itemCount={filteredItems.length}
				showSearch={true}
				searchPlaceholder="Search items..."
				onSearchChange={setSearchQuery}
				filterContent={filterContent}
				hasActiveFilters={domainFilter !== "all"}
			/>

			{/* Desktop Header (hidden on mobile via CSS if needed, but MobilePageHeader handles mobile view) */}
			<div className="hidden md:block">
				<DashboardHeader
					title="Supply"
					subtitle="Procurement & Logistics"
					showSearch={true}
					totalItems={filteredItems.length}
					searchPlaceholder="Search items..."
					onSearchChange={setSearchQuery}
				/>
			</div>

			<div className="space-y-6">
				{activeSelectionCount === 0 && (
					<div className="glass-panel rounded-xl p-4 border border-hyper-green/30">
						<p className="text-sm text-muted">
							No meals selected yet. Visit the Galley and toggle meals to
							auto-populate this list.
						</p>
					</div>
				)}
				<div className="hidden md:block">
					<PanelToolbar
						primaryAction={
							<div className="flex gap-2">
								{/* Add to Cargo (Dock) Button */}
								<button
									type="button"
									onClick={handleDockCargo}
									disabled={isDocking || purchasedCount === 0}
									className={`flex items-center gap-2 px-4 py-2 font-bold rounded-lg text-sm transition-all shadow-sm ${purchasedCount > 0
											? "bg-hyper-green text-carbon hover:shadow-glow-sm"
											: "bg-platinum text-muted cursor-not-allowed"
										}`}
								>
									{isDocking ? (
										<span className="animate-pulse">Transferring...</span>
									) : (
										<>
											<svg
												className="w-4 h-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												role="img"
												aria-labelledby="addCargoIcon"
											>
												<title id="addCargoIcon">Add to Cargo</title>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 13l4 4L19 7"
												/>
											</svg>
											Add to Cargo
											{purchasedCount > 0 && (
												<span className="ml-1 opacity-75">
													({purchasedCount})
												</span>
											)}
										</>
									)}
								</button>
							</div>
						}
						quickAddPlaceholder="Add Item"
						showQuickAdd={showQuickAdd}
						onToggleQuickAdd={() => setShowQuickAdd(!showQuickAdd)}
						quickAddForm={
							<AddItemForm
								listId={list.id}
								defaultDomain={domainFilter === "all" ? "food" : domainFilter}
								onAdd={() => revalidator.revalidate()}
							/>
						}
					/>
				</div>

				<div className="hidden md:flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => setDomainFilter("all")}
						className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${domainFilter === "all"
								? "border-hyper-green bg-hyper-green/15 text-hyper-green"
								: "border-platinum/20 text-muted hover:border-hyper-green/60 hover:text-hyper-green"
							}`}
					>
						All
					</button>
					{ITEM_DOMAINS.map((domain) => {
						const Icon = DOMAIN_ICONS[domain];
						return (
							<button
								key={domain}
								type="button"
								onClick={() => setDomainFilter(domain)}
								className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${domainFilter === domain
										? "border-hyper-green bg-hyper-green/15 text-hyper-green"
										: "border-platinum/20 text-muted hover:border-hyper-green/60 hover:text-hyper-green"
									}`}
							>
								<Icon className="w-3 h-3" />
								<span>{DOMAIN_LABELS[domain]}</span>
							</button>
						);
					})}
				</div>

				{/* Supply List Content */}
				<GroceryList
					key={list.id}
					list={list}
					filterDomain={domainFilter}
					filterSearch={searchQuery}
					onRefresh={() => revalidator.revalidate()}
				/>
			</div>

			{/* Summary Toast */}
			{showSummary && fetcher.data?.summary && (
				<div className="fixed top-24 right-8 z-50 glass-panel rounded-xl p-4 shadow-xl border-l-4 border-hyper-green animate-slide-in-right">
					<div className="flex items-start gap-3">
						<div className="text-2xl">📋</div>
						<div>
							<h4 className="font-bold text-carbon mb-1">List Updated</h4>
							<p className="text-sm text-muted">
								<span className="text-hyper-green font-bold">
									+{fetcher.data.summary.addedItems}
								</span>{" "}
								items added from meal plan.
							</p>
						</div>
						<button
							type="button"
							onClick={() => setShowSummary(false)}
							className="text-muted hover:text-carbon"
						>
							×
						</button>
					</div>
				</div>
			)}

			{/* Dock Success Toast */}
			{showDockSuccess && (
				<div className="fixed bottom-8 right-8 z-50 glass-panel bg-carbon/90 border border-hyper-green text-hyper-green px-6 py-4 rounded-xl shadow-2xl animate-slide-up flex items-center gap-3">
					<span className="text-2xl">🚀</span>
					<div>
						<h4 className="font-bold text-white">Cargo Received!</h4>
						<p className="text-sm text-gray-300">
							{dockFetcher.data?.docked} items transferred to inventory.
						</p>
					</div>
				</div>
			)}

			{/* Floating Action Bar */}
			<FloatingActionBar actions={fabActions} />
		</>
	);
}
