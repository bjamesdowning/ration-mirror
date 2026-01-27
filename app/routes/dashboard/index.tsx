// @ts-nocheck
import { useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { IngestForm } from "~/components/cargo/IngestForm";
import { ManifestGrid } from "~/components/cargo/ManifestGrid";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { requireAuth } from "~/lib/auth.server";
import { formatInventoryCategory, INVENTORY_CATEGORIES } from "~/lib/inventory";
import {
	addItem,
	getInventory,
	InventoryItemSchema,
	jettisonItem,
	updateItem,
} from "~/lib/inventory.server";
import type { Route } from "./+types/dashboard";

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

		// Construct object for validation
		const rawData = {
			name: formData.get("name"),
			quantity: formData.get("quantity"),
			unit: formData.get("unit"),
			category: formData.get("category") ?? undefined,
			tags: rawTags,
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
export default function DashboardIndex({ loaderData }: Route.ComponentProps) {
	const { inventory: initialInventory } = loaderData;
	const [categoryFilter, setCategoryFilter] = useState("all");

	// Search Logic
	const searchFetcher = useFetcher();
	const searchResults = searchFetcher.data?.results;

	const displayedInventory = searchResults || initialInventory;
	const filteredInventory = useMemo(() => {
		if (categoryFilter === "all") return displayedInventory;
		return displayedInventory.filter(
			(item) => item.category === categoryFilter,
		);
	}, [categoryFilter, displayedInventory]);

	return (
		<>
			<DashboardHeader
				title="Cargo Hold"
				subtitle="manifest_v3.0 // connected"
				showSearch={true}
				totalItems={filteredInventory.length}
			/>

			<div className="grid lg:grid-cols-[350px_1fr] gap-8">
				{/* Left Col: Ingest & Stats */}
				<aside className="space-y-8">
					<IngestForm />

					<div className="glass-panel rounded-xl p-4">
						<h3 className="text-label text-carbon mb-3">Cargo Filters</h3>
						<label htmlFor="category-filter" className="text-label text-muted">
							Category
						</label>
						<select
							id="category-filter"
							value={categoryFilter}
							onChange={(event) => setCategoryFilter(event.target.value)}
							className="mt-2 w-full bg-white rounded-lg px-4 py-2 text-carbon border-0 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none cursor-pointer"
						>
							<option value="all">All Categories</option>
							{INVENTORY_CATEGORIES.map((category) => (
								<option key={category} value={category}>
									{formatInventoryCategory(category)}
								</option>
							))}
						</select>
					</div>
				</aside>

				{/* Right Col: Manifest Grid */}
				<main>
					<ManifestGrid items={filteredInventory} />
				</main>
			</div>
		</>
	);
}
