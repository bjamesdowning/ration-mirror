import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

import { EmptyPanel } from "~/components/dashboard/EmptyPanel";
import { PanelToolbar } from "~/components/dashboard/PanelToolbar";
import {
	CheckIcon,
	CloseIcon,
	PlusIcon,
	SearchIcon,
	ShareIcon,
	ShoppingCartIcon,
} from "~/components/icons/PageIcons";
import { DomainFilterChips } from "~/components/shell/DomainFilterChips";
import {
	type FloatingAction,
	FloatingActionBar,
} from "~/components/shell/FloatingActionBar";
import { PageHeader } from "~/components/shell/PageHeader";
import { TagFilterDropdown } from "~/components/shell/TagFilterDropdown";
import { Toast } from "~/components/shell/Toast";
import { AddItemForm } from "~/components/supply/AddItemForm";
import { ExportMenu } from "~/components/supply/ExportMenu";
import { GroceryList } from "~/components/supply/GroceryList";
import { ShareModal } from "~/components/supply/ShareModal";
import { usePageFilters } from "~/hooks/usePageFilters";
import { useToast } from "~/hooks/useToast";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	completeGroceryList,
	createGroceryListFromSelectedMeals,
	getSupplyList,
} from "~/lib/grocery.server";
import {
	getInventory,
	getOrganizationInventoryTags,
} from "~/lib/inventory.server";
import { getActiveMealSelections } from "~/lib/meal-selection.server";
import type { Route } from "./+types/grocery";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	// Light loader: ensure list exists and load current state. Heavy sync (createGroceryListFromSelectedMeals)
	// runs only via action (Update list button or background sync) to avoid Worker resource limits in production.
	const [list, activeSelections, inventory, availableTags] = await Promise.all([
		getSupplyList(context.cloudflare.env.DB, groupId),
		getActiveMealSelections(context.cloudflare.env.DB, groupId),
		getInventory(context.cloudflare.env.DB, groupId),
		getOrganizationInventoryTags(context.cloudflare.env.DB, groupId),
	]);

	return {
		list,
		activeSelectionCount: activeSelections.length,
		availableTags,
		inventory,
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	try {
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
	} catch (e) {
		return handleApiError(e);
	}
}

export default function GroceryDashboard({ loaderData }: Route.ComponentProps) {
	const { list, activeSelectionCount, availableTags, inventory } = loaderData;
	const fetcher = useFetcher(); // For update list
	const dockFetcher = useFetcher(); // For docking
	const revalidator = useRevalidator();
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
	const [showShareModal, setShowShareModal] = useState(false);
	const summaryToast = useToast({ duration: 5000 });
	const dockToast = useToast({ duration: 4000 });
	const {
		activeDomain,
		currentTag,
		handleDomainChange,
		handleTagChange,
		clearAllFilters,
		hasActiveFilters,
	} = usePageFilters();

	// Local Search Logic (matches Cargo/Galley pattern)
	const filteredItems = useMemo(() => {
		if (!list?.items) return [];
		let items = list.items;

		// Filter by Domain
		if (activeDomain !== "all") {
			items = items.filter((item) => item.domain === activeDomain);
		}

		// Filter by Tag: match grocery item names to inventory items with that tag
		if (currentTag && inventory?.length) {
			const parseTags = (t: unknown): string[] => {
				if (Array.isArray(t))
					return t.filter((x): x is string => typeof x === "string");
				if (typeof t === "string") {
					try {
						const p = JSON.parse(t) as unknown;
						return Array.isArray(p)
							? p.filter((x): x is string => typeof x === "string")
							: [];
					} catch {
						return [];
					}
				}
				return [];
			};
			const inventoryNamesWithTag = new Set(
				inventory
					.filter((inv) => parseTags(inv.tags).includes(currentTag))
					.map((inv) => inv.name.toLowerCase()),
			);
			items = items.filter((item) =>
				inventoryNamesWithTag.has(item.name.toLowerCase()),
			);
		}

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			items = items.filter((item) => item.name.toLowerCase().includes(query));
		}

		return items;
	}, [list?.items, searchQuery, activeDomain, currentTag, inventory]);

	// Filter content for mobile sheet
	const filterContent = (
		<div className="space-y-6">
			<DomainFilterChips
				activeDomain={activeDomain}
				onDomainChange={handleDomainChange}
			/>

			{availableTags.length > 0 && (
				<TagFilterDropdown
					label="Filter by tag"
					emptyLabel="All tags"
					currentTag={currentTag}
					availableTags={availableTags}
					onTagChange={handleTagChange}
				/>
			)}

			{/* Actions */}
			<div className="space-y-3 border-t border-platinum dark:border-white/10 pt-6 md:hidden">
				<button
					type="button"
					onClick={() => {
						setShowShareModal(true);
						setIsFilterSheetOpen(false);
					}}
					className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-hyper-green/10 text-hyper-green font-semibold rounded-xl hover:bg-hyper-green/20 transition-colors"
				>
					<ShareIcon className="w-5 h-5" />
					Share List
				</button>
				<div className="text-xs text-center text-muted">
					Export options available on desktop
				</div>
			</div>

			{/* Clear filters */}
			{hasActiveFilters && (
				<button
					type="button"
					onClick={clearAllFilters}
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
		if (!list) return;
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

	// One-time background sync when page loads with selected meals (keeps list fresh without heavy work in loader)
	const hasTriggeredSync = useRef(false);
	useEffect(() => {
		if (
			activeSelectionCount === 0 ||
			hasTriggeredSync.current ||
			fetcher.state !== "idle"
		)
			return;
		hasTriggeredSync.current = true;
		const formData = new FormData();
		formData.set("intent", "update-list");
		fetcher.submit(formData, { method: "POST" });
	}, [activeSelectionCount, fetcher.state, fetcher.submit]);
	useEffect(() => {
		if (
			fetcher.state === "idle" &&
			hasTriggeredSync.current &&
			fetcher.data?.list
		) {
			revalidator.revalidate();
		}
	}, [fetcher.state, fetcher.data?.list, revalidator]);

	// Show summary toast when auto-update or manual update occurs with new items?
	useEffect(() => {
		if (!fetcher.data?.summary) return;
		summaryToast.show();
	}, [fetcher.data?.summary, summaryToast.show]);

	// Show dock success
	useEffect(() => {
		if (!dockFetcher.data?.success) return;
		dockToast.show();
	}, [dockFetcher.data?.success, dockToast.show]);

	// FAB actions for mobile
	const fabActions: FloatingAction[] = [
		{
			id: showQuickAdd ? "cancel" : "add",
			icon: showQuickAdd ? (
				<CloseIcon className="w-6 h-6" />
			) : (
				<PlusIcon className="w-6 h-6" />
			),
			label: showQuickAdd ? "Cancel" : "Add Item",
			variant: showQuickAdd ? "danger" : "default",
			onClick: () => setShowQuickAdd(!showQuickAdd),
		},
		{
			id: "dock",
			icon: <CheckIcon className="w-6 h-6" />,
			label: "Add to Cargo",
			primary: true,
			onClick: handleDockCargo,
			disabled: isDocking || purchasedCount === 0,
		},
	];

	return (
		<>
			{/* Mobile Header */}
			<PageHeader
				icon={<ShoppingCartIcon className="w-6 h-6 text-hyper-green" />}
				title="Supply"
				itemCount={filteredItems.length}
				showSearch={true}
				searchPlaceholder="Search items..."
				onSearchChange={setSearchQuery}
				filterContent={filterContent}
				hasActiveFilters={hasActiveFilters}
				onFilterOpenChange={setIsFilterSheetOpen}
			/>

			{!list ? (
				<EmptyPanel
					icon={<ShoppingCartIcon className="w-12 h-12 text-muted" />}
					title="No Supply List"
					description="We couldn't load your supply list. Please refresh and try again."
					className="py-10"
				/>
			) : (
				<div className="space-y-6">
					{activeSelectionCount === 0 && (
						<EmptyPanel
							icon={<ShoppingCartIcon className="w-12 h-12 text-muted" />}
							title="No Meals Selected"
							description="Visit the Galley and toggle meals to auto-populate this list."
							className="py-8"
						/>
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
										className={`flex items-center gap-2 px-4 py-2 font-bold rounded-lg text-sm transition-all shadow-sm ${
											purchasedCount > 0
												? "bg-hyper-green text-carbon hover:shadow-glow-sm"
												: "bg-platinum text-muted cursor-not-allowed"
										}`}
									>
										{isDocking ? (
											<span className="animate-pulse">Transferring...</span>
										) : (
											<>
												<CheckIcon className="w-4 h-4" />
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
							secondaryAction={
								<div className="flex gap-2">
									<ExportMenu listId={list.id} />
									<button
										type="button"
										onClick={() => setShowShareModal(true)}
										className="flex items-center gap-2 px-4 py-2 bg-platinum text-carbon rounded-lg hover:bg-platinum/80 transition-colors font-medium"
									>
										<ShareIcon className="w-4 h-4" />
										Share
									</button>
								</div>
							}
							quickAddPlaceholder="Add Item"
							showQuickAdd={showQuickAdd}
							onToggleQuickAdd={() => setShowQuickAdd(!showQuickAdd)}
							quickAddForm={
								<AddItemForm
									listId={list.id}
									defaultDomain={activeDomain === "all" ? "food" : activeDomain}
									onAdd={() => revalidator.revalidate()}
								/>
							}
						/>
					</div>

					{/* Mobile Quick Add Form */}
					{showQuickAdd && (
						<div className="glass-panel rounded-xl p-6 md:hidden animate-fade-in">
							<AddItemForm
								listId={list.id}
								defaultDomain={activeDomain === "all" ? "food" : activeDomain}
								onAdd={() => {
									revalidator.revalidate();
									setShowQuickAdd(false);
								}}
							/>
						</div>
					)}

					{/* No Search Results */}
					{filteredItems.length === 0 && searchQuery && (
						<EmptyPanel
							icon={<SearchIcon className="w-12 h-12 text-muted" />}
							title="No Results"
							description={`No items found matching "${searchQuery}"`}
							className="py-12"
						/>
					)}

					{/* Supply List Content */}
					{!(filteredItems.length === 0 && searchQuery) && (
						<GroceryList
							key={list.id}
							list={{ ...list, items: filteredItems }}
							filterDomain="all"
							filterSearch=""
							onRefresh={() => revalidator.revalidate()}
						/>
					)}
				</div>
			)}

			{/* Summary Toast */}
			{summaryToast.isOpen && fetcher.data?.summary && (
				<Toast
					variant="info"
					position="top-right"
					title="List Updated"
					description={
						<>
							<span className="text-hyper-green font-bold">
								+{fetcher.data.summary.addedItems}
							</span>{" "}
							items added from meal plan.
						</>
					}
					onDismiss={summaryToast.hide}
				/>
			)}

			{/* Dock Success Toast */}
			{dockToast.isOpen && (
				<Toast
					variant="success"
					position="bottom-right"
					icon="🚀"
					title="Cargo Received!"
					description={`${dockFetcher.data?.docked} items transferred to inventory.`}
					onDismiss={dockToast.hide}
				/>
			)}

			{/* Floating Action Bar */}
			<FloatingActionBar actions={fabActions} hidden={isFilterSheetOpen} />

			{/* Share Modal */}
			{showShareModal && list && (
				<ShareModal
					listId={list.id}
					existingShareToken={list.shareToken}
					onClose={() => setShowShareModal(false)}
				/>
			)}
		</>
	);
}
