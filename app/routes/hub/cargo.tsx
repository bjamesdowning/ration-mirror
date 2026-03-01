import { useEffect, useMemo, useRef, useState } from "react";
import { useActionData, useRouteLoaderData } from "react-router";
import { z } from "zod";
import {
	CsvImportButton,
	type CsvImportButtonHandle,
} from "~/components/cargo/CsvImportButton";
import { IngestForm } from "~/components/cargo/IngestForm";
import { ManifestGrid } from "~/components/cargo/ManifestGrid";
import { ViewToggle } from "~/components/common/ViewToggle";
import { EmptyPanel } from "~/components/hub/EmptyPanel";
import { PanelToolbar } from "~/components/hub/PanelToolbar";
import {
	CameraIcon,
	CloseIcon,
	ExportIcon,
	ImportIcon,
	PackageIcon,
	PlusIcon,
	SearchIcon,
} from "~/components/icons/PageIcons";
import {
	CameraInput,
	type CameraInputHandle,
} from "~/components/scanner/CameraInput";
import { ScanIntroModal } from "~/components/scanner/ScanIntroModal";
import { ApiHint } from "~/components/shell/ApiHint";
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
import {
	addOrMergeItem,
	CargoItemSchema,
	getCargo,
	getCargoTags,
	jettisonItem,
	updateItem,
} from "~/lib/cargo.server";
import type { ITEM_DOMAINS } from "~/lib/domain";
import {
	createProvisionFromCargo,
	getPromotedCargoIds,
} from "~/lib/meals.server";
import type { Route } from "./+types/cargo";

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

const CARGO_PAGE_SIZE = 200;

// --- LOADER ---
export async function loader({ request, context }: Route.LoaderArgs) {
	const { session, groupId } = await requireActiveGroup(context, request);
	const url = new URL(request.url);
	const domain = url.searchParams.get("domain") || undefined;
	const tag = url.searchParams.get("tag") || undefined;
	const page = Math.max(0, Number(url.searchParams.get("page") ?? "0"));

	// Parse user settings to get view mode preference
	const rawSettings = session.user.settings;
	let defaultViewMode: "card" | "list" = "card";
	if (rawSettings) {
		try {
			const parsed =
				typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;
			if (parsed?.viewMode?.cargo === "list") defaultViewMode = "list";
		} catch {}
	}

	const [cargo, availableTags, promotedCargoIds] = await Promise.all([
		getCargo(
			context.cloudflare.env.DB,
			groupId,
			domain as ItemDomain | undefined,
			{ limit: CARGO_PAGE_SIZE, offset: page * CARGO_PAGE_SIZE },
		),
		getCargoTags(context.cloudflare.env.DB, groupId),
		getPromotedCargoIds(context.cloudflare.env.DB, groupId),
	]);

	return {
		cargo,
		currentDomain: domain,
		currentTag: tag,
		availableTags,
		promotedCargoIds,
		page,
		pageSize: CARGO_PAGE_SIZE,
		defaultViewMode,
	};
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

		const result = CargoItemSchema.safeParse(rawData);

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
					waitUntil: context.cloudflare.ctx.waitUntil.bind(
						context.cloudflare.ctx,
					),
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

		await jettisonItem(context.cloudflare.env, groupId, itemId);
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

		const result = CargoItemSchema.safeParse(rawData);

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

	if (intent === "promote") {
		const itemId = formData.get("itemId") as string;
		if (!itemId) return { success: false, error: "Missing Item ID" };

		try {
			const result = await createProvisionFromCargo(
				context.cloudflare.env.DB,
				groupId,
				itemId,
				context.cloudflare.env,
			);
			return {
				success: true,
				provisionId: result.provision?.id,
				alreadyExisted: result.alreadyExisted,
			};
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith("capacity_exceeded")
			) {
				const parts = error.message.split(":");
				return {
					success: false,
					error: "capacity_exceeded",
					current: Number(parts[2]),
					limit: Number(parts[3]),
				};
			}
			throw error;
		}
	}

	return { success: false, error: "Unknown Intent" };
}

// --- COMPONENT ---
export default function CargoPage({ loaderData }: Route.ComponentProps) {
	const {
		cargo: initialCargo,
		availableTags,
		promotedCargoIds,
		defaultViewMode,
	} = loaderData;
	const actionData = useActionData<{
		error?: string;
		current?: number;
		limit?: number;
	}>();
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
	const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
	const [viewMode, setViewMode] = useState<"card" | "list">(
		defaultViewMode ?? "card",
	);
	const dashboardData = useRouteLoaderData("routes/hub") as {
		balance?: number;
		aiCosts?: { SCAN: number };
		capacity?: {
			cargo?: { current: number; limit: number };
		};
	} | null;
	const [showScanIntroModal, setShowScanIntroModal] = useState(false);
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
	const filteredCargo = useMemo(() => {
		let items: typeof initialCargo = initialCargo;

		const parseTags = (raw: unknown): string[] => {
			if (Array.isArray(raw)) return raw.filter((t) => typeof t === "string");
			if (typeof raw === "string") {
				try {
					const parsed = JSON.parse(raw);
					if (Array.isArray(parsed))
						return parsed.filter((t) => typeof t === "string");
				} catch {}
			}
			return [];
		};

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			items = items.filter(
				(item) =>
					item.name.toLowerCase().includes(query) ||
					parseTags(item.tags).some((tag) => tag.toLowerCase().includes(query)),
			);
		}

		// Filter by tag
		if (currentTag) {
			items = items.filter((item) => parseTags(item.tags).includes(currentTag));
		}

		if (activeDomain !== "all") {
			items = items.filter((item) => item.domain === activeDomain);
		}

		return items;
	}, [initialCargo, searchQuery, currentTag, activeDomain]);

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
			onClick: () => setShowScanIntroModal(true),
		},
		{
			id: "import",
			icon: <ImportIcon />,
			label: "Import",
			onClick: () => {
				importRef.current?.openImport();
			},
		},
		{
			id: "export",
			icon: <ExportIcon />,
			label: "Export",
			onClick: () => {
				window.location.href = "/api/cargo/export";
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
			<ScanIntroModal
				open={showScanIntroModal}
				onClose={() => setShowScanIntroModal(false)}
				onConfirm={() => {
					setShowScanIntroModal(false);
					cameraRef.current?.openCamera();
				}}
				credits={dashboardData?.balance ?? 0}
				costPerScan={dashboardData?.aiCosts?.SCAN ?? 2}
			/>
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
				itemCount={filteredCargo.length}
				showSearch={true}
				searchPlaceholder="Search items..."
				onSearchChange={setSearchQuery}
				filterContent={filterContent}
				hasActiveFilters={hasActiveFilters}
				onFilterOpenChange={setIsFilterSheetOpen}
				titleRowExtra={
					<ViewToggle
						page="cargo"
						currentMode={viewMode}
						onToggle={setViewMode}
					/>
				}
			/>
			{/* Only show capacity for free-tier users — paid (limit === -1) have unlimited */}
			{dashboardData?.capacity?.cargo &&
				dashboardData.capacity.cargo.limit !== -1 && (
					<p className="text-xs text-muted -mt-2 mb-2">
						{dashboardData.capacity.cargo.current}/
						{dashboardData.capacity.cargo.limit} items
					</p>
				)}

			<div className="space-y-6">
				<div className="hidden md:block">
					<PanelToolbar
						primaryAction={
							<button
								type="button"
								onClick={() => setShowScanIntroModal(true)}
								className="flex items-center gap-2 px-4 py-3 bg-hyper-green text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all active:scale-95"
							>
								<CameraIcon className="w-4 h-4" />
								Scan Item
							</button>
						}
						secondaryAction={
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => importRef.current?.openImport()}
									className="flex items-center gap-2 px-4 py-3 bg-platinum text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
								>
									<ImportIcon className="w-4 h-4" />
									Import CSV
								</button>
								<a
									href="/api/cargo/export"
									download="ration-cargo.csv"
									className="flex items-center gap-2 px-4 py-3 bg-platinum text-carbon font-semibold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
								>
									<ExportIcon className="w-4 h-4" />
									Export CSV
								</a>
								<ApiHint variant="icon" />
							</div>
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
				{filteredCargo.length === 0 && !searchQuery && (
					<EmptyPanel
						icon={<PackageIcon className="w-12 h-12 text-muted" />}
						title="Cargo Hold Empty"
						description="Scan a receipt or add items to start tracking your ingredients."
						action={
							<div className="flex flex-wrap justify-center gap-3">
								<button
									type="button"
									onClick={() => setShowScanIntroModal(true)}
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
				{filteredCargo.length === 0 && searchQuery && (
					<EmptyPanel
						icon={<SearchIcon className="w-12 h-12 text-muted" />}
						title="No Results"
						description={`No items found matching "${searchQuery}"`}
						className="py-12"
					/>
				)}

				{/* Inventory Grid / List */}
				{filteredCargo.length > 0 && (
					<ManifestGrid
						items={filteredCargo}
						promotedCargoIds={promotedCargoIds}
						onUpgradeRequired={() => setShowUpgradePrompt(true)}
						viewMode={viewMode}
					/>
				)}
			</div>
			{/* Floating Action Bar (mobile only) */}
			<FloatingActionBar actions={fabActions} hidden={isFilterSheetOpen} />
		</>
	);
}
