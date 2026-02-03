import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { PanelToolbar } from "~/components/dashboard/PanelToolbar";
import { GroceryList } from "~/components/supply/GroceryList";
// TrashIcon removed, utilizing inline SVG.
import type { groceryItem, groceryList } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	createGroceryListFromAllMeals,
	ensureSupplyList,
	getSupplyList,
} from "~/lib/grocery.server";

type GroceryListWithItems = typeof groceryList.$inferSelect & {
	items: (typeof groceryItem.$inferSelect)[];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const list = await getSupplyList(context.cloudflare.env.DB, groupId);
	return { list };
}

export async function action({ request, context }: ActionFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const formData = await request.formData();
	const intent = formData.get("intent");

	// Auto-creation / "Reset" intent (idempotent)
	if (intent === "create") {
		const list = await ensureSupplyList(context.cloudflare.env.DB, groupId);
		return { list };
	}

	if (intent === "create-from-meals") {
		const result = await createGroceryListFromAllMeals(
			context.cloudflare.env.DB,
			groupId,
		);
		return { list: result.list, summary: result.summary };
	}

	return { error: "Invalid intent" };
}

export default function GroceryDashboard() {
	const { list } = useLoaderData<{ list: GroceryListWithItems }>();
	const fetcher = useFetcher();
	const revalidator = useRevalidator();
	const [showSummary, setShowSummary] = useState(false);

	const isPending = fetcher.state !== "idle";

	const handleCreateFromMeals = () => {
		if (
			!window.confirm(
				"Analyze all meals and add missing ingredients to the Supply?",
			)
		)
			return;
		fetcher.submit({ intent: "create-from-meals" }, { method: "POST" });
	};

	// Show summary when creation/update completes
	if (fetcher.data?.summary && !showSummary) {
		setShowSummary(true);
		setTimeout(() => setShowSummary(false), 5000);
	}

	return (
		<>
			<DashboardHeader
				title="Supply"
				subtitle="Procurement & Logistics"
				showSearch={false}
				totalItems={list?.items?.length || 0}
			/>

			<div className="space-y-8">
				<div className="space-y-6">
					<PanelToolbar
						primaryAction={
							<button
								type="button"
								onClick={handleCreateFromMeals}
								disabled={isPending}
								className="flex items-center gap-2 px-4 py-2 bg-hyper-green/10 text-hyper-green border border-hyper-green/30 hover:bg-hyper-green/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
								title="Auto-fill Supply from all meals"
							>
								<svg
									aria-hidden="true"
									className="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<title>Auto-Fill</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-8.038 0l-2.387.477a2 2 0 00-1.022.547M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"
									/>
								</svg>
								{isPending ? "Processing..." : "Auto-Fill Supply"}
							</button>
						}
						quickAddPlaceholder="Search Supply..."
						showQuickAdd={false}
						onToggleQuickAdd={() => {}} // No-op as quick add is removed
						quickAddForm={null}
						filterControls={null} // Removed list selector
						additionalControls={null} // Removed delete button
					/>
				</div>
			</div>

			{/* Summary Toast */}
			{showSummary && fetcher.data?.summary && (
				<div className="fixed top-4 right-4 z-50 glass-panel rounded-xl p-4 shadow-xl border-2 border-hyper-green/30 animate-fade-in">
					<div className="flex items-start gap-3">
						<div className="text-2xl">📦</div>
						<div>
							<h4 className="font-bold text-carbon mb-1">Supply Updated!</h4>
							<p className="text-sm text-muted">
								<span className="text-hyper-green font-semibold">
									{fetcher.data.summary.addedItems} item
									{fetcher.data.summary.addedItems !== 1 ? "s" : ""}
								</span>{" "}
								added from {fetcher.data.summary.mealsProcessed} meal
								{fetcher.data.summary.mealsProcessed !== 1 ? "s" : ""}
							</p>
							{fetcher.data.summary.skippedItems > 0 && (
								<p className="text-xs text-muted mt-1">
									{fetcher.data.summary.skippedItems} item
									{fetcher.data.summary.skippedItems !== 1 ? "s" : ""} already
									in inventory
								</p>
							)}
						</div>
						<button
							type="button"
							onClick={() => setShowSummary(false)}
							className="text-muted hover:text-carbon transition-colors"
						>
							×
						</button>
					</div>
				</div>
			)}

			{/* Supply List Content */}
			<GroceryList
				key={list.id}
				list={list}
				onRefresh={() => revalidator.revalidate()}
			/>
		</>
	);
}
