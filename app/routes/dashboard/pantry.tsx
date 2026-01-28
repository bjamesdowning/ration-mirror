// @ts-nocheck
import { useMemo, useState } from "react";
// import { useFetcher } from "react-router"; // Unused import removed
import { IngestForm } from "~/components/cargo/IngestForm";
import { ManifestGrid } from "~/components/cargo/ManifestGrid";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { PanelToolbar } from "~/components/dashboard/PanelToolbar";
import { CameraInput } from "~/components/scanner/CameraInput";
import { requireAuth } from "~/lib/auth.server";
import { formatInventoryCategory, INVENTORY_CATEGORIES } from "~/lib/inventory";
import {
	addItem,
	getInventory,
	InventoryItemSchema,
	jettisonItem,
	updateItem,
} from "~/lib/inventory.server";
import type { Route } from "./+types/pantry";

// --- LOADER ---
export async function loader({ request, context }: Route.LoaderArgs) {
	const { user } = await requireAuth(context, request);
	const inventory = await getInventory(context.cloudflare.env.DB, user.id);
	return { inventory };
}

// --- ACTION ---
export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const userId = user.id;

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
			tags: rawTags,
			expiresAt: expiresAtValue
				? new Date(expiresAtValue as string)
				: undefined,
		};

		const result = InventoryItemSchema.safeParse(rawData);

		if (!result.success) {
			return { success: false, errors: result.error.flatten() };
		}

		await addItem(context.cloudflare.env, userId, result.data);
		return { success: true };
	}

	if (intent === "delete") {
		const itemId = formData.get("itemId") as string;
		if (!itemId) return { success: false, error: "Missing Item ID" };

		await jettisonItem(context.cloudflare.env.DB, userId, itemId);
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
			tags: rawTags,
			expiresAt: expiresAtValue || undefined,
		};

		const result = InventoryItemSchema.safeParse(rawData);

		if (!result.success) {
			return { success: false, errors: result.error.flatten() };
		}

		const updated = await updateItem(
			context.cloudflare.env,
			userId,
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
	const { inventory: initialInventory } = loaderData;
	const [categoryFilter, setCategoryFilter] = useState("all");
	const [showQuickAdd, setShowQuickAdd] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// Local Search Logic
	const filteredInventory = useMemo(() => {
		let items = initialInventory;

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			items = items.filter(
				(item) =>
					item.name.toLowerCase().includes(query) ||
					item.tags?.some((tag) => tag.toLowerCase().includes(query)),
			);
		}

		// Filter by category
		if (categoryFilter !== "all") {
			items = items.filter((item) => item.category === categoryFilter);
		}

		return items;
	}, [initialInventory, searchQuery, categoryFilter]);

	// Handle scan completion - close quick add if open
	const handleScanComplete = () => {
		// Close quick add form since scan now has its own modal
		setShowQuickAdd(false);
	};

	return (
		<>
			<DashboardHeader
				title="Pantry"
				subtitle="Inventory Management // Your Ingredients"
				showSearch={true}
				totalItems={filteredInventory.length}
				searchPlaceholder="Search ingredients..."
				onSearchChange={setSearchQuery}
			/>

			<div className="space-y-6">
				{/* Unified Toolbar */}
				<PanelToolbar
					primaryAction={<CameraInput onScanComplete={handleScanComplete} />}
					quickAddPlaceholder="Add Item"
					showQuickAdd={showQuickAdd}
					onToggleQuickAdd={() => setShowQuickAdd(!showQuickAdd)}
					quickAddForm={<IngestForm />}
					filterControls={
						<>
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
						</>
					}
				/>

				{/* Empty State */}
				{filteredInventory.length === 0 && (
					<div className="text-center py-16 glass-panel rounded-2xl">
						<div className="text-6xl mb-6">🥫</div>
						<h3 className="text-display text-xl text-carbon mb-2">
							Your Pantry is Empty
						</h3>
						<p className="text-sm text-muted mb-6 max-w-md mx-auto">
							Scan a receipt or add items manually to start tracking your
							ingredients.
						</p>
						<div className="flex flex-wrap justify-center gap-4">
							<CameraInput onScanComplete={handleScanComplete} />
							<button
								type="button"
								onClick={() => setShowQuickAdd(true)}
								className="px-6 py-3 bg-platinum text-carbon font-medium rounded-xl hover:bg-platinum/80 transition-all"
							>
								Add First Item
							</button>
						</div>
					</div>
				)}

				{/* Inventory Grid */}
				{filteredInventory.length > 0 && (
					<ManifestGrid items={filteredInventory} />
				)}
			</div>
		</>
	);
}
