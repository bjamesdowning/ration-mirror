import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getGroceryListByShareToken } from "~/lib/grocery.server";

interface SharedItem {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	category: string;
	isPurchased: boolean;
}

interface SharedList {
	name: string;
	items: SharedItem[];
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
	if (!data?.list) {
		return [{ title: "List Not Found - Ration" }];
	}
	return [
		{ title: `${data.list.name} - Shared List - Ration` },
		{ name: "description", content: `Shared grocery list: ${data.list.name}` },
	];
};

export async function loader({ context, params }: LoaderFunctionArgs) {
	const token = params.token;

	if (!token) {
		throw new Response("Invalid share link", { status: 400 });
	}

	const list = await getGroceryListByShareToken(
		context.cloudflare.env.DB,
		token,
	);

	if (!list) {
		throw new Response("List not found or link expired", { status: 404 });
	}

	return { list };
}

export default function SharedListPage() {
	const { list } = useLoaderData<{ list: SharedList }>();

	// Group items by category
	const groupedItems = list.items.reduce<Record<string, SharedItem[]>>(
		(acc, item) => {
			const category = item.category || "other";
			if (!acc[category]) acc[category] = [];
			acc[category].push(item);
			return acc;
		},
		{},
	);

	const categoryNames: Record<string, string> = {
		dry_goods: "Dry Goods",
		cryo_frozen: "Frozen",
		perishable: "Refrigerated",
		produce: "Produce",
		canned: "Canned Goods",
		liquid: "Beverages & Liquids",
		other: "Other",
	};

	const purchased = list.items.filter((i) => i.isPurchased).length;
	const total = list.items.length;

	return (
		<div className="min-h-screen bg-black text-[#39FF14] font-mono">
			{/* Header */}
			<header className="border-b border-[#39FF14]/30 p-4">
				<div className="max-w-2xl mx-auto">
					<div className="text-xs opacity-70 uppercase tracking-widest mb-1">
						SHARED MANIFEST
					</div>
					<h1 className="text-2xl font-bold uppercase tracking-wider">
						{list.name}
					</h1>
					<div className="mt-2 text-sm opacity-70">
						Progress: {purchased}/{total} items acquired
					</div>
				</div>
			</header>

			{/* Content */}
			<main className="max-w-2xl mx-auto p-4 space-y-6">
				{list.items.length === 0 ? (
					<div className="text-center py-12 opacity-50">
						<div className="text-4xl mb-4">📋</div>
						<p>No items in this list</p>
					</div>
				) : (
					Object.entries(groupedItems).map(([category, items]) => (
						<section key={category}>
							<h2 className="text-xs uppercase tracking-widest opacity-70 mb-3 border-b border-[#39FF14]/20 pb-2">
								{categoryNames[category] || category}
							</h2>
							<ul className="space-y-2">
								{items.map((item) => (
									<li
										key={item.id}
										className={`flex items-center gap-3 p-2 border border-[#39FF14]/20 ${
											item.isPurchased ? "opacity-50" : ""
										}`}
									>
										<span
											className={`w-5 h-5 flex items-center justify-center border ${
												item.isPurchased
													? "border-[#39FF14] bg-[#39FF14] text-black"
													: "border-[#39FF14]/50"
											}`}
										>
											{item.isPurchased && "✓"}
										</span>
										<span
											className={`flex-1 ${item.isPurchased ? "line-through" : ""}`}
										>
											{item.name}
										</span>
										<span className="text-xs opacity-70">
											{item.quantity > 1 && `${item.quantity} ${item.unit}`}
										</span>
									</li>
								))}
							</ul>
						</section>
					))
				)}
			</main>

			{/* Footer */}
			<footer className="border-t border-[#39FF14]/30 p-4 mt-8">
				<div className="max-w-2xl mx-auto text-center text-xs opacity-50">
					<p>Powered by RATION — Resource Allocation Terminal</p>
				</div>
			</footer>
		</div>
	);
}
