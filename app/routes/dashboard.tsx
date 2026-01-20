// @ts-nocheck

import { useFetcher } from "react-router";
import { IngestForm } from "~/components/cargo/IngestForm";
import { ManifestGrid } from "~/components/cargo/ManifestGrid";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { requireAuth } from "~/lib/auth.server";
import {
	addItem,
	getInventory,
	InventoryItemSchema,
	jettisonItem,
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
			tags: rawTags,
			// expiresAt could be added here if we had an input
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

	return { success: false, error: "Unknown Intent" };
}

// --- COMPONENT ---
// ... component start
export default function Dashboard({ loaderData }: Route.ComponentProps) {
	const { inventory: initialInventory } = loaderData;
	const _deleteFetcher = useFetcher();

	// Search Logic
	const searchFetcher = useFetcher();
	const searchResults = searchFetcher.data?.results;

	// Derived state: Use search results if available and query is not empty, otherwise full inventory
	// We check if we are searching by checking if we have submitted
	const _isSearching =
		searchFetcher.state !== "idle" || searchFetcher.data?.results;
	const displayedInventory = searchResults || initialInventory;

	return (
		<div className="min-h-screen bg-[#051105] text-[#39FF14] font-mono p-4 md:p-8">
			<DashboardHeader
				title="Cargo Hold"
				subtitle="manifest_v3.0 // connected"
				showSearch={true}
				totalItems={displayedInventory.length}
			/>

			<div className="grid lg:grid-cols-[350px_1fr] gap-8">
				{/* Left Col: Ingest & Stats */}
				<aside className="space-y-8">
					<IngestForm />

					{/* Simple Stats / Filter Placeholder */}
					<div className="border border-[#39FF14]/30 p-4 opacity-50">
						<h3 className="uppercase text-xs mb-2">System Status</h3>
						<div className="h-1 bg-[#39FF14]/20 w-full mb-1">
							<div className="h-full bg-[#39FF14] w-[80%] animate-pulse"></div>
						</div>
						<p className="text-[10px]">Life Support: NOMINAL</p>
					</div>
				</aside>

				{/* Right Col: Manifest Grid */}
				<main>
					<ManifestGrid items={displayedInventory} />
				</main>
			</div>
		</div>
	);
}
