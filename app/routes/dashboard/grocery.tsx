import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { EmptyPanel } from "~/components/dashboard/EmptyPanel";
import { PanelToolbar } from "~/components/dashboard/PanelToolbar";
import { GroceryList } from "~/components/supply/GroceryList";
// TrashIcon removed, utilizing inline SVG.
import type { groceryItem, groceryList } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	createGroceryList,
	createGroceryListFromAllMeals,
	deleteGroceryList,
	getGroceryLists,
} from "~/lib/grocery.server";

type GroceryListWithItems = typeof groceryList.$inferSelect & {
	items: (typeof groceryItem.$inferSelect)[];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const lists = await getGroceryLists(context.cloudflare.env.DB, groupId);
	return { lists };
}

export async function action({ request, context }: ActionFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const formData = await request.formData();
	const intent = formData.get("intent");

	if (intent === "create") {
		const name = formData.get("name")?.toString() || "Shopping List";
		const list = await createGroceryList(context.cloudflare.env.DB, groupId, {
			name,
		});
		return { list };
	}

	if (intent === "delete") {
		const listId = formData.get("listId")?.toString();
		if (listId) {
			await deleteGroceryList(context.cloudflare.env.DB, groupId, listId);
			return { deleted: true };
		}
	}

	if (intent === "create-from-meals") {
		const result = await createGroceryListFromAllMeals(
			context.cloudflare.env.DB,
			groupId,
			"Shopping from Meals",
		);
		return { list: result.list, summary: result.summary };
	}

	return { error: "Invalid intent" };
}

export default function GroceryDashboard() {
	const { lists } = useLoaderData<{ lists: GroceryListWithItems[] }>();
	const fetcher = useFetcher();
	const revalidator = useRevalidator();
	const [activeListId, setActiveListId] = useState<string | null>(
		lists[0]?.id || null,
	);
	const [newListName, setNewListName] = useState("");
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [showSummary, setShowSummary] = useState(false);

	const activeList = lists.find((l) => l.id === activeListId);
	const isPending = fetcher.state !== "idle";

	const handleCreateList = (e: React.FormEvent) => {
		e.preventDefault();
		fetcher.submit(
			{ intent: "create", name: newListName || "Shopping List" },
			{ method: "POST" },
		);
		setNewListName("");
		setShowCreateForm(false);
	};

	const handleDeleteList = (listId: string) => {
		if (
			!window.confirm(
				"Delete this list? All items will be permanently removed.",
			)
		)
			return;
		fetcher.submit({ intent: "delete", listId }, { method: "POST" });
		if (activeListId === listId) {
			setActiveListId(lists.find((l) => l.id !== listId)?.id || null);
		}
	};

	const handleCreateFromMeals = () => {
		if (
			!window.confirm(
				"Create a grocery list from all your meals? This will analyze your meals and add missing ingredients.",
			)
		)
			return;
		fetcher.submit({ intent: "create-from-meals" }, { method: "POST" });
	};

	// Show summary when creation completes
	if (fetcher.data?.summary && !showSummary) {
		setShowSummary(true);
		setTimeout(() => setShowSummary(false), 5000);
		if (fetcher.data.list?.id) {
			setActiveListId(fetcher.data.list.id);
		}
	}

	return (
		<>
			<DashboardHeader
				title="Supply"
				subtitle="Procurement & Logistics"
				showSearch={false}
				totalItems={lists.length}
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
								title="Auto-create list from all your meals"
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
								{isPending ? "Processing..." : "Auto-Fill"}
							</button>
						}
						quickAddPlaceholder="New List"
						showQuickAdd={showCreateForm}
						onToggleQuickAdd={() => setShowCreateForm(!showCreateForm)}
						quickAddForm={
							<form
								onSubmit={handleCreateList}
								className="flex gap-2 items-end"
							>
								<div className="flex-1 space-y-1">
									<label
										htmlFor="list-name"
										className="text-xs text-muted font-medium"
									>
										List Name
									</label>
									<input
										id="list-name"
										type="text"
										value={newListName}
										onChange={(e) => setNewListName(e.target.value)}
										placeholder="e.g., Weekly Groceries"
										className="w-full bg-ceramic border border-carbon/20 px-3 py-2 rounded-lg text-sm text-carbon placeholder-muted focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
										// biome-ignore lint/a11y/noAutofocus: input focus is required for UX
										autoFocus
									/>
								</div>
								<button
									type="submit"
									disabled={isPending}
									className="px-4 py-2 bg-hyper-green text-carbon font-bold rounded-lg hover:shadow-glow-sm transition-all disabled:opacity-50 h-[38px]"
								>
									Create
								</button>
							</form>
						}
						filterControls={
							lists.length > 0 ? (
								<>
									<label
										htmlFor="list-select"
										className="text-xs text-muted font-medium"
									>
										List:
									</label>
									<div className="relative">
										<select
											id="list-select"
											value={activeListId || ""}
											onChange={(e) => setActiveListId(e.target.value)}
											className="appearance-none bg-platinum border border-carbon/10 pl-3 pr-8 py-2 rounded-lg text-sm text-carbon focus:outline-none focus:ring-2 focus:ring-hyper-green/50 cursor-pointer min-w-[150px]"
										>
											{lists.map((list) => (
												<option key={list.id} value={list.id}>
													{list.name}
												</option>
											))}
										</select>
										<div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-carbon">
											<svg
												className="h-4 w-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<title>Select</title>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M19 9l-7 7-7-7"
												/>
											</svg>
										</div>
									</div>
								</>
							) : null
						}
						additionalControls={
							activeListId && (
								<button
									type="button"
									onClick={() => handleDeleteList(activeListId)}
									className="text-xs text-danger/70 hover:text-danger px-2 transition-colors font-medium uppercase tracking-wider flex items-center gap-1"
								>
									<svg
										className="w-4 h-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<title>Delete</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
									Delete
								</button>
							)
						}
					/>
				</div>
			</div>

			{/* Summary Toast */}
			{showSummary && fetcher.data?.summary && (
				<div className="fixed top-4 right-4 z-50 glass-panel rounded-xl p-4 shadow-xl border-2 border-hyper-green/30 animate-fade-in">
					<div className="flex items-start gap-3">
						<div className="text-2xl">🛒</div>
						<div>
							<h4 className="font-bold text-carbon mb-1">List Created!</h4>
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

			{/* Active List Content */}
			{activeList ? (
				<GroceryList
					key={activeList.id}
					list={activeList}
					onRefresh={() => revalidator.revalidate()}
				/>
			) : (
				<EmptyPanel
					icon="📋"
					title="No Lists Yet"
					description="Create a grocery list to start tracking your shopping needs."
					action={
						<button
							type="button"
							onClick={() => setShowCreateForm(true)}
							className="px-6 py-3 bg-hyper-green text-carbon font-bold rounded-xl shadow-glow hover:shadow-glow-sm transition-all"
						>
							Create Your First List
						</button>
					}
				/>
			)}
		</>
	);
}
