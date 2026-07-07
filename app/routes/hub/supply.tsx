import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	data,
	useFetcher,
	useLocation,
	useRevalidator,
	useRouteLoaderData,
} from "react-router";
import { EmptyPanel } from "~/components/hub/EmptyPanel";
import { PanelToolbar } from "~/components/hub/PanelToolbar";
import {
	CheckIcon,
	CloseIcon,
	PlusIcon,
	RocketIcon,
	SearchIcon,
	ShareIcon,
	ShoppingCartIcon,
} from "~/components/icons/PageIcons";
import {
	CameraInput,
	type CameraInputHandle,
} from "~/components/scanner/CameraInput";
import { TagFilterChips } from "~/components/shared/TagFilterChips";
import { DomainFilterChips } from "~/components/shell/DomainFilterChips";
import {
	type FloatingAction,
	FloatingActionBar,
} from "~/components/shell/FloatingActionBar";
import { PageHeader } from "~/components/shell/PageHeader";
import { Toast } from "~/components/shell/Toast";
import { UpgradePrompt } from "~/components/shell/UpgradePrompt";
import { AddItemForm } from "~/components/supply/AddItemForm";
import { ExportMenu } from "~/components/supply/ExportMenu";
import { ReplenishModal } from "~/components/supply/ReplenishModal";
import { ReplenishScanIntroModal } from "~/components/supply/ReplenishScanIntroModal";
import { ShareModal } from "~/components/supply/ShareModal";
import { SnoozedItemsPanel } from "~/components/supply/SnoozedItemsPanel";
import { SupplyList } from "~/components/supply/SupplyList";
import { SupplyShoppingBar } from "~/components/supply/SupplyShoppingBar";
import { usePageFilters } from "~/hooks/usePageFilters";
import { useToast } from "~/hooks/useToast";
import { getUserSettings, requireActiveGroup } from "~/lib/auth.server";
import { CapacityExceededError } from "~/lib/capacity.server";
import { getCargoTagIndex } from "~/lib/cargo.server";
import { useConfirm } from "~/lib/confirm-context";
import { handleApiError } from "~/lib/error-handler";
import { getManifestWeekMealsForSupply } from "~/lib/manifest.server";
import { getActiveMealSelections } from "~/lib/meal-selection.server";
import { ListIdSchema } from "~/lib/schemas/supply";
import {
	completeSupplyList,
	createSupplyListFromSelectedMeals,
	getActiveSnoozes,
	getSupplyList,
} from "~/lib/supply.server";
import { filterSupplyItemsByCargoTags } from "~/lib/supply-tags";
import { getOrganizationTags, getTagsForMealIds } from "~/lib/tags.server";
import {
	emitSupplySyncError,
	emitSupplySyncInfo,
} from "~/lib/telemetry.server";
import { resolveUnitDisplayMode } from "~/lib/unit-display-mode";
import type { Route } from "./+types/supply";

/** Skip revalidation when only domain/tag filters change — Supply filters are client-side only. */
export function shouldRevalidate({
	currentUrl,
	nextUrl,
	defaultShouldRevalidate,
	formAction,
}: {
	currentUrl: URL;
	nextUrl: URL;
	defaultShouldRevalidate: boolean;
	formAction?: string;
}) {
	// Same URL means a mutation-triggered refresh, not filter-only navigation.
	if (currentUrl.href === nextUrl.href) return true;
	// Form submissions (actions) should always revalidate
	if (formAction) return defaultShouldRevalidate;
	// Same path — check if only cosmetic params changed
	if (currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
	const currentKeys = new Set(currentUrl.searchParams.keys());
	const nextKeys = new Set(nextUrl.searchParams.keys());
	const allKeys = new Set([...currentKeys, ...nextKeys]);
	for (const key of allKeys) {
		if (
			key === "domain" ||
			key === "tags" ||
			key === "sort" ||
			key === "hidePurchased"
		)
			continue;
		if (currentUrl.searchParams.get(key) !== nextUrl.searchParams.get(key)) {
			return defaultShouldRevalidate;
		}
	}
	return false;
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId, session } = await requireActiveGroup(context, request);

	// Light loader: ensure list exists and load current state. Heavy sync (createSupplyListFromSelectedMeals)
	// runs only via action (Update list button or background sync) to avoid Worker resource limits in production.
	const [
		list,
		activeSelections,
		cargoItems,
		availableTags,
		manifestWeekMeals,
		snoozes,
		userSettings,
	] = await Promise.all([
		getSupplyList(context.cloudflare.env.DB, groupId),
		getActiveMealSelections(context.cloudflare.env.DB, groupId),
		getCargoTagIndex(context.cloudflare.env.DB, groupId),
		getOrganizationTags(context.cloudflare.env.DB, groupId),
		getManifestWeekMealsForSupply(context.cloudflare.env.DB, groupId),
		getActiveSnoozes(context.cloudflare.env.DB, groupId),
		getUserSettings(context.cloudflare.env.DB, session.user.id),
	]);

	const mealIds = [
		...new Set(
			list?.items?.flatMap((item) => {
				const ids = [...(item.sourceMealIds ?? [])];
				return item.sourceMealId ? [...ids, item.sourceMealId] : ids;
			}) ?? [],
		),
	];
	const mealTagsById = await getTagsForMealIds(
		context.cloudflare.env.DB,
		mealIds,
	);
	const mealTagSlugsByMealId: Record<string, string[]> = {};
	for (const [mealId, tags] of mealTagsById) {
		mealTagSlugsByMealId[mealId] = tags.map((t) => t.slug);
	}

	return {
		list,
		activeSelectionCount: activeSelections.length,
		manifestWeekMealCount: manifestWeekMeals.length,
		availableTags: availableTags.filter((t) => t.cargoCount > 0),
		cargo: cargoItems,
		snoozes,
		unitDisplayMode: resolveUnitDisplayMode(userSettings),
		mealTagSlugsByMealId,
	};
}

export async function action({ request, context }: Route.ActionArgs) {
	const { groupId, session } = await requireActiveGroup(context, request);
	const userId = session.user.id;

	try {
		const formData = await request.formData();
		const intent = formData.get("intent");

		// Manual Update / Refresh
		if (intent === "update-list") {
			const userSettings = await getUserSettings(
				context.cloudflare.env.DB,
				userId,
			);
			const unitDisplayMode = resolveUnitDisplayMode(userSettings);
			const syncSource = formData.get("syncSource");
			const telemetryContext = {
				requestId: request.headers.get("cf-ray") ?? undefined,
				trigger:
					syncSource === "background"
						? ("dashboard_grocery_background_sync" as const)
						: ("dashboard_grocery_action_update_list" as const),
				organizationId: groupId,
			};
			const startedAtMs = Date.now();
			emitSupplySyncInfo("supply_sync.action.start", telemetryContext, {
				intent: "update-list",
			});
			try {
				const result = await createSupplyListFromSelectedMeals(
					context.cloudflare.env,
					groupId,
					undefined,
					telemetryContext,
					unitDisplayMode,
				);
				emitSupplySyncInfo("supply_sync.action.success", telemetryContext, {
					intent: "update-list",
					duration_ms: Date.now() - startedAtMs,
					added_items_count: result.summary.addedItems,
					skipped_items_count: result.summary.skippedItems,
					meals_processed_count: result.summary.mealsProcessed,
					ingredient_rows_count: result.summary.totalIngredients,
				});
				return { list: result.list, summary: result.summary };
			} catch (error) {
				emitSupplySyncError(
					"supply_sync.action.error",
					telemetryContext,
					error,
					{
						intent: "update-list",
						duration_ms: Date.now() - startedAtMs,
					},
				);
				throw error;
			}
		}

		// Dock Cargo (Complete List / Move purchased to inventory)
		if (intent === "dock-cargo") {
			const parsed = ListIdSchema.safeParse({
				listId: formData.get("listId") ?? undefined,
			});
			if (!parsed.success) {
				return { error: "Invalid or missing list ID" };
			}
			const { listId } = parsed.data;
			const userSettings = await getUserSettings(
				context.cloudflare.env.DB,
				userId,
			);
			const unitDisplayMode = resolveUnitDisplayMode(userSettings);

			const result = await completeSupplyList(
				context.cloudflare.env,
				groupId,
				listId,
				{ unitMode: unitDisplayMode },
			);
			return { success: true, docked: result.docked };
		}

		return { error: "Invalid intent" };
	} catch (e) {
		if (e instanceof CapacityExceededError) {
			throw data(
				{
					error: "capacity_exceeded",
					resource: e.resource,
					current: e.current,
					limit: e.limit,
					tier: e.tier,
					isExpired: e.isExpired,
					canAdd: e.canAdd,
					upgradePath: "crew_member",
				},
				{ status: 403 },
			);
		}
		return handleApiError(e);
	}
}

export default function SupplyDashboard({ loaderData }: Route.ComponentProps) {
	const {
		list,
		availableTags,
		cargo,
		snoozes = [],
		mealTagSlugsByMealId = {},
	} = loaderData;
	const location = useLocation();
	type SyncResult = {
		list?: typeof list;
		summary?: {
			addedItems: number;
			skippedItems: number;
			mealsProcessed: number;
			totalIngredients: number;
		};
	};
	const fetcher = useFetcher<SyncResult>(); // For update list
	const dockFetcher = useFetcher(); // For docking

	// Use fetcher-returned list only while its revalidation is loading; once idle,
	// always fall back to loader data so mutations don't render stale snapshots.
	const displayList =
		(fetcher.state === "loading" ? fetcher.data?.list : undefined) ?? list;
	const [showQuickAdd, setShowQuickAdd] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
	const [showShareModal, setShowShareModal] = useState(false);
	const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
	const [showReplenishModal, setShowReplenishModal] = useState(false);
	const [showReplenishScanIntro, setShowReplenishScanIntro] = useState(false);
	const cameraRef = useRef<CameraInputHandle>(null);
	const revalidator = useRevalidator();
	const dashboardData = useRouteLoaderData("routes/hub") as
		| {
				balance?: number;
				aiCosts?: { SCAN: number };
		  }
		| undefined;
	const { confirm } = useConfirm();
	const summaryToast = useToast({ duration: 5000 });
	const dockToast = useToast({ duration: 4000 });
	const lastSyncSource = useRef<"background" | "manual" | null>(null);
	const {
		activeDomain,
		currentTags,
		sortMode,
		hidePurchased,
		handleDomainChange,
		toggleTag,
		clearAllFilters,
		hasActiveFilters,
	} = usePageFilters({ supportsSupplySort: true });

	const mealTagsByMealId = useMemo(
		() => new Map(Object.entries(mealTagSlugsByMealId)),
		[mealTagSlugsByMealId],
	);

	// Local Search Logic (matches Cargo/Galley pattern)
	const { filteredItems, progressItems } = useMemo(() => {
		if (!displayList?.items) return { filteredItems: [], progressItems: [] };
		let items = displayList.items;

		// Filter by Domain
		if (activeDomain !== "all") {
			items = items.filter((item) => item.domain === activeDomain);
		}

		if (currentTags.length > 0 && cargo?.length) {
			items = filterSupplyItemsByCargoTags(items, cargo, currentTags);
		}

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			items = items.filter((item) => item.name.toLowerCase().includes(query));
		}

		const progressItems = items;
		const filteredItems = hidePurchased
			? items.filter((item) => !item.isPurchased)
			: items;

		return { filteredItems, progressItems };
	}, [
		displayList?.items,
		searchQuery,
		activeDomain,
		currentTags,
		cargo,
		hidePurchased,
	]);

	// Filter content for mobile sheet
	const filterContent = (
		<div className="space-y-6">
			<DomainFilterChips
				activeDomain={activeDomain}
				onDomainChange={handleDomainChange}
			/>

			{availableTags.length > 0 && (
				<TagFilterChips
					label="Filter by tag"
					tags={availableTags}
					activeSlugs={currentTags}
					onToggle={toggleTag}
				/>
			)}

			{/* Actions */}
			<div className="space-y-3 border-t border-platinum dark:border-white/10 pt-6 md:hidden">
				<button
					type="button"
					onClick={() => {
						handleRefreshList();
						setIsFilterSheetOpen(false);
					}}
					disabled={fetcher.state !== "idle"}
					className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-platinum text-carbon font-semibold rounded-xl hover:bg-platinum/80 transition-colors disabled:opacity-50"
				>
					<RefreshCw
						className={`w-5 h-5 ${fetcher.state !== "idle" ? "animate-spin" : ""}`}
					/>
					Refresh list
				</button>
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

	// Calculate purchased count for Dock button state (all items, not filtered)
	const purchasedCount =
		displayList?.items?.filter((i) => i.isPurchased).length || 0;

	const progressPurchasedCount = progressItems.filter(
		(i) => i.isPurchased,
	).length;
	const progressTotalCount = progressItems.length;

	const handleDockCargo = async () => {
		if (!displayList) return;
		if (purchasedCount === 0) return;
		if (
			!(await confirm({
				title: `Ready to transfer ${purchasedCount} purchased items to your Cargo?`,
				message: "Items will be added to your Cargo inventory.",
				confirmLabel: "Dock Cargo",
				variant: "default",
			}))
		)
			return;

		dockFetcher.submit(
			{ intent: "dock-cargo", listId: displayList.id },
			{ method: "POST" },
		);
	};

	const handleRefreshList = () => {
		if (fetcher.state !== "idle") return;
		lastSyncSource.current = "manual";
		const formData = new FormData();
		formData.set("intent", "update-list");
		fetcher.submit(formData, { method: "POST" });
	};

	// Background sync on each Supply navigation (session-scoped per visit).
	const lastSyncedPath = useRef<string | null>(null);
	useEffect(() => {
		if (location.pathname !== "/hub/supply") return;
		if (lastSyncedPath.current === location.key) return;
		if (fetcher.state !== "idle") return;
		lastSyncedPath.current = location.key;
		lastSyncSource.current = "background";
		const formData = new FormData();
		formData.set("intent", "update-list");
		formData.set("syncSource", "background");
		fetcher.submit(formData, { method: "POST" });
	}, [location.pathname, location.key, fetcher.state, fetcher.submit]);

	// Show summary toast when auto-update or manual update occurs with new items?
	useEffect(() => {
		if (!fetcher.data?.summary) return;
		if (lastSyncSource.current === "background") return;
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
			id: "replenish",
			icon: <CheckIcon className="w-6 h-6" />,
			label: "Replenish Cargo",
			primary: true,
			onClick: () => setShowReplenishModal(true),
			disabled: isDocking,
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
			{!displayList ? (
				<EmptyPanel
					icon={<ShoppingCartIcon className="w-12 h-12 text-muted" />}
					title="No Supply List"
					description="We couldn't load your supply list. Please refresh and try again."
					className="py-10"
				/>
			) : (
				<div className="space-y-6 pb-36 md:pb-0">
					{/* Sync status banner — visible during background or manual list update */}
					{fetcher.state !== "idle" && (
						<output
							className="flex items-center gap-2 px-4 py-2 rounded-lg bg-hyper-green/10 text-hyper-green text-sm font-medium"
							aria-live="polite"
						>
							<span className="animate-pulse">●</span>
							Updating list from Cargo, Galley, and Manifest...
						</output>
					)}

					<SupplyShoppingBar
						purchasedCount={progressPurchasedCount}
						totalCount={progressTotalCount}
					/>
					<div className="hidden md:block">
						<PanelToolbar
							primaryAction={
								<div className="flex gap-2">
									<button
										type="button"
										onClick={handleRefreshList}
										disabled={fetcher.state !== "idle"}
										className="flex items-center gap-2 px-4 py-2 font-semibold rounded-lg text-sm transition-all btn-secondary"
									>
										<RefreshCw
											className={`w-4 h-4 ${fetcher.state !== "idle" ? "animate-spin" : ""}`}
										/>
										Refresh list
									</button>
									<button
										type="button"
										onClick={() => setShowReplenishModal(true)}
										disabled={isDocking}
										className="flex items-center gap-2 px-4 py-2 font-bold rounded-lg text-sm transition-all shadow-sm bg-hyper-green text-carbon hover:shadow-glow-sm"
									>
										<CheckIcon className="w-4 h-4" />
										Replenish Cargo
									</button>
								</div>
							}
							secondaryAction={
								<div className="flex gap-2">
									<ExportMenu listId={displayList.id} />
									<button
										type="button"
										onClick={() => setShowShareModal(true)}
										className="flex items-center gap-2 px-4 py-3 btn-secondary font-semibold rounded-lg transition-all"
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
									listId={displayList.id}
									defaultDomain={activeDomain === "all" ? "food" : activeDomain}
								/>
							}
						/>
					</div>

					{/* Mobile Quick Add Form */}
					{showQuickAdd && (
						<div
							data-testid="supply-quick-add"
							className="glass-panel rounded-xl p-6 md:hidden animate-fade-in"
						>
							<AddItemForm
								listId={displayList.id}
								defaultDomain={activeDomain === "all" ? "food" : activeDomain}
								onAdd={() => setShowQuickAdd(false)}
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
						<SupplyList
							key={displayList.id}
							list={{ ...displayList, items: filteredItems }}
							cargoRows={cargo ?? []}
							mealTagsByMealId={mealTagsByMealId}
							filterDomain="all"
							filterSearch=""
							sortMode={sortMode}
							onRefresh={() => revalidator.revalidate()}
						/>
					)}

					{/* Snoozed Items (collapsible) */}
					{snoozes.length > 0 && (
						<SnoozedItemsPanel
							snoozes={snoozes}
							listId={displayList.id}
							cargoRows={cargo ?? []}
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
							supply rows refreshed from Cargo, Galley, and Manifest.
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
					icon={<RocketIcon className="w-6 h-6 text-hyper-green" />}
					title="Cargo Received!"
					description={`${dockFetcher.data?.docked} items transferred to Cargo.`}
					onDismiss={dockToast.hide}
				/>
			)}

			<FloatingActionBar actions={fabActions} hidden={isFilterSheetOpen} />

			{/* Share Modal */}
			{showShareModal && displayList && (
				<ShareModal
					listId={displayList.id}
					existingShareToken={displayList.shareToken}
					onClose={() => setShowShareModal(false)}
					onUpgradeRequired={() => setShowUpgradePrompt(true)}
				/>
			)}

			{/* Upgrade Prompt (shown when free-tier user attempts a crew-only feature) */}
			<UpgradePrompt
				open={showUpgradePrompt}
				onClose={() => setShowUpgradePrompt(false)}
				title="Crew Member required"
				description="Sharing supply lists is a Crew Member feature. Upgrade to unlock sharing, member invites, and unlimited capacity."
			/>

			<ReplenishModal
				open={showReplenishModal}
				purchasedCount={purchasedCount}
				onClose={() => setShowReplenishModal(false)}
				onDockPurchased={handleDockCargo}
				onScanReceipt={() => {
					setShowReplenishModal(false);
					setShowReplenishScanIntro(true);
				}}
				isDocking={isDocking}
				scanCost={dashboardData?.aiCosts?.SCAN}
			/>

			<ReplenishScanIntroModal
				open={showReplenishScanIntro}
				onClose={() => setShowReplenishScanIntro(false)}
				onConfirm={() => {
					setShowReplenishScanIntro(false);
					cameraRef.current?.openCamera();
				}}
				credits={dashboardData?.balance ?? 0}
				costPerScan={dashboardData?.aiCosts?.SCAN ?? 2}
			/>

			{displayList && (
				<CameraInput
					ref={cameraRef}
					origin="supply"
					supplyListId={displayList.id}
					hideButton
					className="hidden"
					onScanComplete={() => {
						revalidator.revalidate();
						dockToast.show();
					}}
				/>
			)}
		</>
	);
}
