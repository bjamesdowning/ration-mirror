import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { DOMAIN_LABELS } from "~/lib/domain";
import { getGroceryListByShareToken } from "~/lib/grocery.server";

interface SharedItem {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	domain: string;
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

	// Group items by domain
	const groupedItems = list.items.reduce<Record<string, SharedItem[]>>(
		(acc, item) => {
			const domain = item.domain || "food";
			if (!acc[domain]) acc[domain] = [];
			acc[domain].push(item);
			return acc;
		},
		{},
	);

	const purchased = list.items.filter((i) => i.isPurchased).length;
	const total = list.items.length;
	const progressPercent = total > 0 ? Math.round((purchased / total) * 100) : 0;

	return (
		<div className="min-h-screen bg-ceramic text-carbon">
			{/* Header */}
			<header className="border-b border-carbon/10 p-4 bg-ceramic/90 backdrop-blur sticky top-0 z-10">
				<div className="max-w-2xl mx-auto">
					<div className="flex items-center gap-2 text-muted text-xs mb-1">
						<span className="w-2 h-2 rounded-full bg-hyper-green" />
						Shared List
					</div>
					<h1 className="text-display text-2xl text-carbon">{list.name}</h1>
					<div className="mt-3 flex items-center gap-3">
						<div className="flex-1 h-2 bg-platinum rounded-full overflow-hidden">
							<div
								className="h-full bg-hyper-green rounded-full transition-all duration-300"
								style={{ width: `${progressPercent}%` }}
							/>
						</div>
						<span className="text-sm text-muted">
							{purchased}/{total} items
						</span>
					</div>
				</div>
			</header>

			{/* Content */}
			<main className="max-w-2xl mx-auto p-4 space-y-6">
				{list.items.length === 0 ? (
					<div className="text-center py-16 glass-panel rounded-2xl">
						<div className="text-6xl mb-4">📋</div>
						<p className="text-muted">No items in this list</p>
					</div>
				) : (
					Object.entries(groupedItems).map(([domain, items]) => (
						<section key={domain} className="glass-panel rounded-xl p-4">
							<h2 className="text-label text-muted mb-3 pb-2 border-b border-carbon/10">
								{DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS] || domain}
							</h2>
							<ul className="space-y-2">
								{items.map((item) => (
									<li
										key={item.id}
										className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
											item.isPurchased
												? "bg-platinum/50 opacity-60"
												: "bg-ceramic hover:bg-platinum/30"
										}`}
									>
										<span
											className={`w-5 h-5 flex items-center justify-center rounded-md border-2 ${
												item.isPurchased
													? "border-hyper-green bg-hyper-green text-white"
													: "border-carbon/30"
											}`}
										>
											{item.isPurchased && (
												<svg
													aria-hidden="true"
													className="w-3 h-3"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={3}
														d="M5 13l4 4L19 7"
													/>
												</svg>
											)}
										</span>
										<span
											className={`flex-1 ${item.isPurchased ? "line-through text-muted" : "text-carbon"}`}
										>
											{item.name}
										</span>
										{item.quantity > 1 && (
											<span className="text-sm text-muted">
												{item.quantity} {item.unit}
											</span>
										)}
									</li>
								))}
							</ul>
						</section>
					))
				)}
			</main>

			{/* Footer */}
			<footer className="border-t border-carbon/10 p-4 mt-8 bg-ceramic">
				<div className="max-w-2xl mx-auto text-center">
					<p className="text-xs text-muted mb-2">Powered by Ration</p>
					<Link
						to="/"
						className="text-sm text-hyper-green hover:text-hyper-green/80 transition-colors"
					>
						Create your own smart grocery lists →
					</Link>
				</div>
			</footer>
		</div>
	);
}
