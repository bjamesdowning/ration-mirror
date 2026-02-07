import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
	CsvImportButton,
	type CsvImportButtonHandle,
} from "~/components/cargo/CsvImportButton";
import { IngestForm } from "~/components/cargo/IngestForm";
import { ManifestGrid } from "~/components/cargo/ManifestGrid";
import { EmptyPanel } from "~/components/dashboard/EmptyPanel";
import { PackageIcon } from "~/components/icons/PageIcons";
import {
	CameraInput,
	type CameraInputHandle,
} from "~/components/scanner/CameraInput";
import { FilterChip } from "~/components/shell/FilterSheet";
import {
	type FloatingAction,
	FloatingActionBar,
} from "~/components/shell/FloatingActionBar";
import { MobilePageHeader } from "~/components/shell/MobilePageHeader";
import { requireActiveGroup } from "~/lib/auth.server";
import { DOMAIN_ICONS, DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import {
	addItem,
	getInventory,
	getOrganizationInventoryTags,
	InventoryItemSchema,
	jettisonItem,
	updateItem,
} from "~/lib/inventory.server";
import type { Route } from "./+types/pantry";

type ItemDomain = (typeof ITEM_DOMAINS)[number];

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

		await addItem(context.cloudflare.env, groupId, result.data);
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
	const {
		inventory: initialInventory,
		currentDomain,
		currentTag,
		availableTags,
	} = loaderData;
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchParams, setSearchParams] = useSearchParams();
	const cameraRef = useRef<CameraInputHandle>(null);
	const importRef = useRef<CsvImportButtonHandle>(null);

	const activeDomainParam =
		searchParams.get("domain") || currentDomain || "all";
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

	// Check if any filters are active
	const hasActiveFilters = activeDomain !== "all" || !!currentTag;

	// FAB actions for mobile
	const fabActions: FloatingAction[] = [
		{
			id: "add",
			icon: <PlusIcon />,
			label: "Add Item",
			onClick: () => setShowQuickAdd(true),
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
				<h4 className="text-sm font-medium text-muted mb-3">Tag</h4>
				<select
					id="tag-filter-mobile"
					value={currentTag || ""}
					onChange={handleTagChange}
					className="w-full bg-platinum dark:bg-white/10 border border-carbon/10 dark:border-white/10 px-4 py-3 rounded-xl text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
				>
					<option value="">All Items</option>
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
				icon={<PackageIcon className="w-6 h-6 text-hyper-green" />}
				title="Cargo"
				itemCount={filteredInventory.length}
				showSearch={true}
				searchPlaceholder="Search ingredients..."
				onSearchChange={setSearchQuery}
				filterContent={filterContent}
				hasActiveFilters={hasActiveFilters}
			/>

			<div className="space-y-4">
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
						{showQuickAdd ? "✕ Cancel" : "+ Add Item"}
					</button>
					<CameraInput ref={cameraRef} onScanComplete={handleScanComplete} />
					<CsvImportButton
						ref={importRef}
						onImportComplete={handleImportComplete}
						defaultDomain={activeDomain === "all" ? undefined : activeDomain}
					/>
				</div>

				{/* Quick Add Form (collapsible) */}
				{showQuickAdd && (
					<div className="glass-panel rounded-xl p-6 animate-fade-in">
						<IngestForm
							defaultDomain={activeDomain === "all" ? undefined : activeDomain}
						/>
					</div>
				)}

				{/* Empty State */}
				{filteredInventory.length === 0 && (
					<EmptyPanel
						icon={<PackageIcon className="w-12 h-12 text-muted" />}
						title="Cargo Hold Empty"
						description="Scan a receipt or add items to start tracking your ingredients."
						action={
							<div className="flex flex-wrap justify-center gap-3">
								<CameraInput
									ref={cameraRef}
									onScanComplete={handleScanComplete}
								/>
								<button
									type="button"
									onClick={() => setShowQuickAdd(true)}
									className="px-6 py-3 bg-platinum text-carbon font-medium rounded-xl hover:bg-platinum/80 transition-all"
								>
									Add First Item
								</button>
							</div>
						}
					/>
				)}

				{/* Inventory Grid */}
				{filteredInventory.length > 0 && (
					<ManifestGrid items={filteredInventory} />
				)}
			</div>

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

function CameraIcon() {
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
				d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
			/>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
			/>
		</svg>
	);
}

function ImportIcon() {
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
				d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
			/>
		</svg>
	);
}
