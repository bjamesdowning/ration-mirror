import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
// import { useFetcher } from "react-router"; // Unused import removed
import { CsvImportButton } from "~/components/cargo/CsvImportButton";
import { IngestForm } from "~/components/cargo/IngestForm";
import { ManifestGrid } from "~/components/cargo/ManifestGrid";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { EmptyPanel } from "~/components/dashboard/EmptyPanel";
import { PanelToolbar } from "~/components/dashboard/PanelToolbar";
import { CameraInput } from "~/components/scanner/CameraInput";
import { requireActiveGroup } from "~/lib/auth.server";
import { DOMAIN_ICONS, DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import { formatInventoryCategory, INVENTORY_CATEGORIES } from "~/lib/inventory";
import {
	addItem,
	getInventory,
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
	const inventory = await getInventory(
		context.cloudflare.env.DB,
		groupId,
		domain as ItemDomain | undefined,
	);
	return { inventory, currentDomain: domain };
}

// --- ACTION ---
export async function action({ request, context }: Route.ActionArgs) {
	const { groupId } = await requireActiveGroup(context, request);

	const formData = await request.formData();
	const intent = formData.get("intent");

	if (intent === "create") {
		// Parse tags: formData.getAll("tags") returns array of strings
		const rawTags = formData.getAll("tags");
		const expiresAtValue = formData.get("expiresAt");

		// Construct object for validation
		const rawData = {
			name: formData.get("name"),
			quantity: formData.get("quantity"),
			unit: formData.get("unit"),
			category: formData.get("category") ?? undefined,
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
			category: formData.get("category") ?? undefined,
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
	const { inventory: initialInventory, currentDomain } = loaderData;
	const [categoryFilter, setCategoryFilter] = useState("all");
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchParams, setSearchParams] = useSearchParams();

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

		// Filter by category
		if (categoryFilter !== "all") {
			items = items.filter((item) => item.category === categoryFilter);
		}

		if (activeDomain !== "all") {
			items = items.filter((item) => item.domain === activeDomain);
		}

		return items;
	}, [initialInventory, searchQuery, categoryFilter, activeDomain]);

	// Handle scan completion - close quick add if open
	const handleScanComplete = () => {
		// Close quick add form since scan now has its own modal
		setShowQuickAdd(false);
	};

	const handleImportComplete = () => {
		setShowQuickAdd(false);
	};

	return (
		<>
			<DashboardHeader
				title="Cargo"
				subtitle="Inventory Management // Stock"
				showSearch={true}
				totalItems={filteredInventory.length}
				searchPlaceholder="Search ingredients..."
				onSearchChange={setSearchQuery}
			/>

			<div className="space-y-6">
				{/* Unified Toolbar */}
				<PanelToolbar
					primaryAction={
						<div className="flex gap-2">
							<CameraInput onScanComplete={handleScanComplete} />
							<CsvImportButton
								onImportComplete={handleImportComplete}
								defaultDomain={
									activeDomain === "all" ? undefined : activeDomain
								}
							/>
						</div>
					}
					quickAddPlaceholder="Add Item"
					showQuickAdd={showQuickAdd}
					onToggleQuickAdd={() => setShowQuickAdd(!showQuickAdd)}
					quickAddForm={
						<IngestForm
							defaultDomain={activeDomain === "all" ? undefined : activeDomain}
						/>
					}
					filterControls={
						<div className="flex flex-wrap items-center gap-3">
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
									{ITEM_DOMAINS.map((domain) => {
										const Icon = DOMAIN_ICONS[domain];
										return (
											<button
												key={domain}
												type="button"
												onClick={() => handleDomainChange(domain)}
												className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
													activeDomain === domain
														? "bg-hyper-green text-carbon"
														: "bg-platinum text-carbon hover:bg-platinum/80"
												}`}
											>
												<Icon className="w-3 h-3" />
												<span>{DOMAIN_LABELS[domain]}</span>
											</button>
										);
									})}
								</div>
							</div>
							<div className="flex items-center gap-2">
								<label
									htmlFor="category-filter"
									className="text-xs text-muted font-medium"
								>
									Category:
								</label>
								<select
									id="category-filter"
									value={categoryFilter}
									onChange={(event) => setCategoryFilter(event.target.value)}
									className="bg-platinum border border-carbon/10 px-3 py-2 rounded-lg text-sm text-carbon focus:outline-none focus:ring-2 focus:ring-hyper-green/50 cursor-pointer"
								>
									<option value="all">All Categories</option>
									{INVENTORY_CATEGORIES.map((category) => (
										<option key={category} value={category}>
											{formatInventoryCategory(category)}
										</option>
									))}
								</select>
								{categoryFilter !== "all" && (
									<button
										type="button"
										onClick={() => setCategoryFilter("all")}
										className="text-xs text-hyper-green hover:text-hyper-green/80 transition-colors"
									>
										Clear
									</button>
								)}
							</div>
						</div>
					}
				/>

				{/* Empty State */}
				{filteredInventory.length === 0 && (
					<EmptyPanel
						icon="🥫"
						title="Your Pantry is Empty"
						description="Scan a receipt or add items manually to start tracking your ingredients."
						action={
							<>
								<CameraInput onScanComplete={handleScanComplete} />
								<button
									type="button"
									onClick={() => setShowQuickAdd(true)}
									className="px-6 py-3 bg-platinum text-carbon font-medium rounded-xl hover:bg-platinum/80 transition-all"
								>
									Add First Item
								</button>
							</>
						}
					/>
				)}

				{/* Inventory Grid */}
				{filteredInventory.length > 0 && (
					<ManifestGrid items={filteredInventory} />
				)}
			</div>
		</>
	);
}
