import { useEffect, useMemo, useRef, useState } from "react";
import { useActionData, useRouteLoaderData } from "react-router";
import { z } from "zod";
import {
	CsvImportButton,
	type CsvImportButtonHandle,
} from "~/components/cargo/CsvImportButton";
import { IngestForm } from "~/components/cargo/IngestForm";
import { ManifestGrid } from "~/components/cargo/ManifestGrid";
import { EmptyPanel } from "~/components/dashboard/EmptyPanel";
import { PanelToolbar } from "~/components/dashboard/PanelToolbar";
import {
	CameraIcon,
	CloseIcon,
	ImportIcon,
	PackageIcon,
	PlusIcon,
	SearchIcon,
} from "~/components/icons/PageIcons";
import {
	CameraInput,
	type CameraInputHandle,
} from "~/components/scanner/CameraInput";
import { DomainFilterChips } from "~/components/shell/DomainFilterChips";
import {
	type FloatingAction,
	FloatingActionBar,
} from "~/components/shell/FloatingActionBar";
import { PageHeader } from "~/components/shell/PageHeader";
import { TagFilterDropdown } from "~/components/shell/TagFilterDropdown";
import { UpgradePrompt } from "~/components/shell/UpgradePrompt";
import { usePageFilters } from "~/hooks/usePageFilters";
import { requireActiveGroup } from "~/lib/auth.server";
import { CapacityExceededError } from "~/lib/capacity.server";
import type { ITEM_DOMAINS } from "~/lib/domain";
import {
	addOrMergeItem,
	getInventory,
	getOrganizationInventoryTags,
	InventoryItemSchema,
	jettisonItem,
	updateItem,
} from "~/lib/inventory.server";
import type { Route } from "./+types/pantry";

type ItemDomain = (typeof ITEM_DOMAINS)[number];

const CreateMergeIntentSchema = z
	.object({
		mergeChoice: z.enum(["merge", "new"]).optional(),
		mergeTargetId: z.string().min(1).optional(),
	})
	.superRefine((value, ctx) => {
		if (value.mergeChoice === "merge" && !value.mergeTargetId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["mergeTargetId"],
				message: "mergeTargetId is required when mergeChoice is merge",
			});
		}
	});

// --- LOADER ---
export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const url = new URL(request.url);
	const domain = url.searchParams.get("domain") || undefined;
	const tag = url.searchParams.get("tag") || undefined;

	const [inventory, availableTags] = await Promise.all([
		getInventory(
			context.cloudflare.env.DB,
			groupId,
			domain as ItemDomain | undefined,
		),
		getOrganizationInventoryTags(context.cloudflare.env.DB, groupId),
	]);

	return { inventory, currentDomain: domain, currentTag: tag, availableTags };
}

// --- ACTION ---
export async function action({ request, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	const formData = await request.formData();
	const intent = formData.get("intent");

	if (intent === "create") {
		// Parse tags: handle comma-separated string
		const tagsValue = formData.get("tags") as string;
		const rawTags = tagsValue
			? tagsValue
					.split(",")
					.map((t) => t.trim())
					.filter((t) => t.length > 0)
			: [];
		const expiresAtValue = formData.get("expiresAt");

		// Construct object for validation
		const rawData = {
			name: formData.get("name"),
			quantity: formData.get("quantity"),
			unit: formData.get("unit"),
			domain: formData.get("domain") ?? undefined,
			tags: rawTags,
			expiresAt: expiresAtValue
				? new Date(expiresAtValue as string)
				: undefined,
		};

		const result = InventoryItemSchema.safeParse(rawData);

		if (!result.success) {
			return { success: false, errors: result.error.flatten() };
		}

		const mergeMetaResult = CreateMergeIntentSchema.safeParse({
			mergeChoice:
				typeof formData.get("mergeChoice") === "string"
					? formData.get("mergeChoice")
					: undefined,
			mergeTargetId:
				typeof formData.get("mergeTargetId") === "string"
					? formData.get("mergeTargetId")
					: undefined,
		});
		if (!mergeMetaResult.success) {
			return {
				success: false,
				error: "Invalid merge metadata",
				errors: mergeMetaResult.error.flatten(),
			};
		}

		const { mergeChoice, mergeTargetId } = mergeMetaResult.data;
		let addResult: Awaited<ReturnType<typeof addOrMergeItem>>;
		try {
			addResult = await addOrMergeItem(
				context.cloudflare.env,
				groupId,
				result.data,
				{
					allowFuzzyCandidate: true,
					forceCreateNew: mergeChoice === "new",
					mergeTargetId:
						mergeChoice === "merge" && typeof mergeTargetId === "string"
							? mergeTargetId
							: undefined,
				},
			);
		} catch (error) {
			if (error instanceof CapacityExceededError) {
				return {
					success: false,
					error: "capacity_exceeded",
					resource: error.resource,
					current: error.current,
					limit: error.limit,
					tier: error.tier,
					isExpired: error.isExpired,
					canAdd: error.canAdd,
					upgradePath: "crew_member",
				};
			}
			throw error;
		}

		if (addResult.status === "invalid_merge_target") {
			return {
				success: false,
				error: "Invalid merge target",
			};
		}

		if (addResult.status === "merge_candidate") {
			return {
				success: false,
				requiresMergeConfirmation: true,
				candidate: addResult.candidate,
				submittedInput: {
					name: result.data.name,
					quantity: result.data.quantity,
					unit: result.data.unit,
					domain: result.data.domain,
					tags: rawTags.join(", "),
					expiresAt: expiresAtValue ? String(expiresAtValue) : "",
				},
			};
		}

		return { success: true };
	}

	if (intent === "delete") {
		const itemId = formData.get("itemId") as string;
		if (!itemId) return { success: false, error: "Missing Item ID" };

		await jettisonItem(context.cloudflare.env.DB, groupId, itemId);
		return { success: true };
	}

	if (intent === "update") {
		const itemId = formData.get("itemId") as string;
		if (!itemId) return { success: false, error: "Missing Item ID" };

		// Parse tags: handle comma-separated string from edit form
		const tagsValue = formData.get("tags") as string;
		const rawTags = tagsValue
			? tagsValue
					.split(",")
					.map((t) => t.trim())
					.filter((t) => t.length > 0)
			: [];
		const expiresAtValue = formData.get("expiresAt");

		// Construct object for validation
		const rawData = {
			name: formData.get("name"),
			quantity: formData.get("quantity"),
			unit: formData.get("unit"),
			domain: formData.get("domain") ?? undefined,
			tags: rawTags,
			expiresAt: expiresAtValue || undefined,
		};

		const result = InventoryItemSchema.safeParse(rawData);

		if (!result.success) {
			return { success: false, errors: result.error.flatten() };
		}

		const updated = await updateItem(
			context.cloudflare.env,
			groupId,
			itemId,
			result.data,
		);
		if (!updated) {
			return { success: false, error: "Item not found or unauthorized" };
		}
		return { success: true };
	}

	return { success: false, error: "Unknown Intent" };
}

// --- COMPONENT ---
export default function PantryPage({ loaderData }: Route.ComponentProps) {
	const { inventory: initialInventory, availableTags } = loaderData;
	const actionData = useActionData<{
		error?: string;
		current?: number;
		limit?: number;
	}>();
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
	const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
	const dashboardData = useRouteLoaderData("routes/dashboard") as {
		capacity?: {
			inventory?: { current: number; limit: number };
		};
	} | null;
	const cameraRef = useRef<CameraInputHandle>(null);
	const importRef = useRef<CsvImportButtonHandle>(null);
	const {
		activeDomain,
		currentTag,
		handleDomainChange,
		handleTagChange,
		clearAllFilters,
		hasActiveFilters,
	} = usePageFilters();

	// Local Search Logic
	const filteredInventory = useMemo(() => {
		let items: typeof initialInventory = initialInventory;

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			items = items.filter(
				(item) =>
					item.name.toLowerCase().includes(query) ||
					(item.tags as string[] | undefined)?.some((tag: string) =>
						tag.toLowerCase().includes(query),
					),
			);
		}

		// Filter by tag
		if (currentTag) {
			items = items.filter((item) =>
				(item.tags as string[] | undefined)?.includes(currentTag),
			);
		}

		if (activeDomain !== "all") {
			items = items.filter((item) => item.domain === activeDomain);
		}

		return items;
	}, [initialInventory, searchQuery, currentTag, activeDomain]);

	// Handle scan completion - close quick add if open
	const handleScanComplete = () => {
		setShowQuickAdd(false);
	};

	const handleImportComplete = () => {
		setShowQuickAdd(false);
	};

	useEffect(() => {
		if (actionData?.error === "capacity_exceeded") {
			setShowUpgradePrompt(true);
		}
	}, [actionData]);

	// FAB actions for mobile
	const fabActions: FloatingAction[] = [
		{
			id: showQuickAdd ? "cancel" : "add",
			icon: showQuickAdd ? <CloseIcon /> : <PlusIcon />,
			label: showQuickAdd ? "Cancel" : "Add Item",
			variant: showQuickAdd ? "danger" : "default",
			onClick: () => setShowQuickAdd(!showQuickAdd),
		},
		{
			id: "scan",
			icon: <CameraIcon />,
			label: "Scan",
			primary: true,
			onClick: () => {
				// Trigger the hidden CameraInput
				cameraRef.current?.openCamera();
			},
		},
		{
			id: "import",
			icon: <ImportIcon />,
			label: "Import",
			onClick: () => {
				importRef.current?.openImport();
			},
		},
	];

	// Filter content for mobile sheet
	const filterContent = (
		<div className="space-y-6">
			<DomainFilterChips
				activeDomain={activeDomain}
				onDomainChange={handleDomainChange}
			/>

			<TagFilterDropdown
				label="Tag"
				emptyLabel="All Items"
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
				title="Cargo capacity reached"
				description={
					typeof actionData?.current === "number" &&
					typeof actionData?.limit === "number"
						? `You are at ${actionData.current}/${actionData.limit} items. Upgrade to Crew Member for unlimited capacity.`
						: undefined
				}
			/>
			{/* Hidden instances for refs + modals (always in DOM, even on mobile) */}
			<CameraInput
				ref={cameraRef}
				onScanComplete={handleScanComplete}
				className="hidden"
			/>
			<CsvImportButton
				ref={importRef}
				onImportComplete={handleImportComplete}
				defaultDomain={activeDomain === "all" ? undefined : activeDomain}
				className="hidden"
			/>

			{/* Mobile Header */}
			<PageHeader
				icon={<PackageIcon className="w-6 h-6 text-hyper-green" />}
				title="Cargo"
				itemCount={filteredInventory.length}
				showSearch={true}
				searchPlaceholder="Search ingredients..."
				onSearchChange={setSearchQuery}
				filterContent={filterContent}
				hasActiveFilters={hasActiveFilters}
				onFilterOpenChange={setIsFilterSheetOpen}
			/>
			{/* Only show capacity for free-tier users — paid (limit === -1) have unlimited */}
			{dashboardData?.capacity?.inventory &&
				dashboardData.capacity.inventory.limit !== -1 && (
					<p className="text-xs text-muted -mt-2 mb-2">
						{dashboardData.capacity.inventory.current}/
						{dashboardData.capacity.inventory.limit} items
					</p>
				)}

			<div className="space-y-6">
				<div className="hidden md:block">
					<PanelToolbar
						primaryAction={
							<button
								type="button"
								onClick={() => cameraRef.current?.openCamera()}
								className="flex items-center gap-2 px-4 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all active:scale-95"
							>
								<CameraIcon className="w-4 h-4" />
								Scan Item
							</button>
						}
						secondaryAction={
							<button
								type="button"
								onClick={() => importRef.current?.openImport()}
								className="flex items-center gap-2 px-4 py-3 bg-platinum text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
							>
								<ImportIcon className="w-4 h-4" />
								Import CSV
							</button>
						}
						quickAddPlaceholder="Add Item"
						showQuickAdd={showQuickAdd}
						onToggleQuickAdd={() => setShowQuickAdd(!showQuickAdd)}
						quickAddForm={
							<IngestForm
								defaultDomain={
									activeDomain === "all" ? undefined : activeDomain
								}
								onUpgradeRequired={() => setShowUpgradePrompt(true)}
							/>
						}
					/>
				</div>

				{/* Mobile Quick Add Form */}
				{showQuickAdd && (
					<div className="glass-panel rounded-xl p-6 md:hidden animate-fade-in">
						<IngestForm
							defaultDomain={activeDomain === "all" ? undefined : activeDomain}
							onUpgradeRequired={() => setShowUpgradePrompt(true)}
						/>
					</div>
				)}

				{/* Empty State */}
				{filteredInventory.length === 0 && !searchQuery && (
					<EmptyPanel
						icon={<PackageIcon className="w-12 h-12 text-muted" />}
						title="Cargo Hold Empty"
						description="Scan a receipt or add items to start tracking your ingredients."
						action={
							<div className="flex flex-wrap justify-center gap-3">
								<button
									type="button"
									onClick={() => cameraRef.current?.openCamera()}
									className="px-6 py-3 bg-hyper-green text-carbon font-bold rounded-xl shadow-glow-sm hover:shadow-glow transition-all"
								>
									Scan Receipt
								</button>
								<button
									type="button"
									onClick={() => setShowQuickAdd(true)}
									className="px-6 py-3 bg-platinum text-carbon font-medium rounded-xl hover:bg-platinum/80 transition-all"
								>
									Add First Item
								</button>
								<a
									href="https://www.hellofresh.com/"
									target="_blank"
									rel="noreferrer"
									className="px-6 py-3 bg-platinum text-carbon font-medium rounded-xl hover:bg-platinum/80 transition-all"
								>
									Explore Meal Kits
								</a>
							</div>
						}
					/>
				)}

				{/* No Search Results */}
				{filteredInventory.length === 0 && searchQuery && (
					<EmptyPanel
						icon={<SearchIcon className="w-12 h-12 text-muted" />}
						title="No Results"
						description={`No items found matching "${searchQuery}"`}
						className="py-12"
					/>
				)}

				{/* Inventory Grid */}
				{filteredInventory.length > 0 && (
					<ManifestGrid items={filteredInventory} />
				)}
			</div>
			{/* Floating Action Bar (mobile only) */}
			<FloatingActionBar actions={fabActions} hidden={isFilterSheetOpen} />
		</>
	);
}
