import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { GroceryList } from "~/components/supply/GroceryList";
import type { groceryItem, groceryList } from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import {
	createGroceryList,
	deleteGroceryList,
	getGroceryLists,
} from "~/lib/grocery.server";

type GroceryListWithItems = typeof groceryList.$inferSelect & {
	items: (typeof groceryItem.$inferSelect)[];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const lists = await getGroceryLists(context.cloudflare.env.DB, user.id);
	return { lists };
}

export async function action({ request, context }: ActionFunctionArgs) {
	const { user } = await requireAuth(context, request);
	const formData = await request.formData();
	const intent = formData.get("intent");

	if (intent === "create") {
		const name = formData.get("name")?.toString() || "Shopping List";
		const list = await createGroceryList(context.cloudflare.env.DB, user.id, {
			name,
		});
		return { list };
	}

	if (intent === "delete") {
		const listId = formData.get("listId")?.toString();
		if (listId) {
			await deleteGroceryList(context.cloudflare.env.DB, user.id, listId);
			return { deleted: true };
		}
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

	return (
		<>
			<DashboardHeader
				title="SUPPLY DEPOT"
				subtitle="procurement // manifest"
				showSearch={false}
				totalItems={lists.length}
			/>

			<div className="space-y-8">
				{/* List Selector */}
				<div className="flex flex-wrap items-center gap-4">
					<div className="flex-1 flex flex-wrap items-center gap-2">
						{lists.map((list) => (
							<button
								key={list.id}
								type="button"
								onClick={() => setActiveListId(list.id)}
								className={`group relative px-4 py-2 font-mono text-sm uppercase tracking-wider transition-all ${
									activeListId === list.id
										? "bg-[#39FF14] text-black font-bold"
										: "border border-[#39FF14]/50 text-[#39FF14] hover:bg-[#39FF14]/10"
								}`}
							>
								{list.name}
								{activeListId !== list.id && (
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											handleDeleteList(list.id);
										}}
										className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
										aria-label="Delete list"
									>
										×
									</button>
								)}
							</button>
						))}
					</div>

					{/* Create New List */}
					{showCreateForm ? (
						<form onSubmit={handleCreateList} className="flex gap-2">
							<input
								type="text"
								value={newListName}
								onChange={(e) => setNewListName(e.target.value)}
								placeholder="List name..."
								className="bg-black border border-[#39FF14]/50 px-3 py-2 font-mono text-sm text-[#39FF14] placeholder-[#39FF14]/30 focus:outline-none focus:border-[#39FF14]"
								autoFocus
							/>
							<button
								type="submit"
								disabled={isPending}
								className="px-4 py-2 bg-[#39FF14] text-black font-bold uppercase tracking-wider hover:bg-[#2bff00] disabled:opacity-50"
							>
								Create
							</button>
							<button
								type="button"
								onClick={() => setShowCreateForm(false)}
								className="px-3 py-2 border border-[#39FF14]/50 text-[#39FF14] hover:bg-[#39FF14]/10"
							>
								Cancel
							</button>
						</form>
					) : (
						<button
							type="button"
							onClick={() => setShowCreateForm(true)}
							className="px-4 py-2 border border-dashed border-[#39FF14]/50 text-[#39FF14] hover:bg-[#39FF14]/10 font-mono text-sm uppercase transition-colors"
						>
							+ New List
						</button>
					)}
				</div>

				{/* Active List Content */}
				{activeList ? (
					<GroceryList
						key={activeList.id}
						list={activeList}
						onRefresh={() => revalidator.revalidate()}
					/>
				) : (
					<div className="text-center py-16 border border-[#39FF14]/20 border-dashed">
						<div className="text-6xl mb-6">📋</div>
						<h3 className="text-xl font-bold uppercase tracking-wider mb-2">
							No Lists Yet
						</h3>
						<p className="text-sm opacity-70 mb-6">
							Create a grocery list to start tracking your shopping needs
						</p>
						<button
							type="button"
							onClick={() => setShowCreateForm(true)}
							className="px-6 py-3 bg-[#39FF14] text-black font-bold uppercase tracking-wider hover:bg-[#2bff00] shadow-[0_0_15px_rgba(57,255,20,0.5)] transition-all"
						>
							Create Your First List
						</button>
					</div>
				)}
			</div>
		</>
	);
}
