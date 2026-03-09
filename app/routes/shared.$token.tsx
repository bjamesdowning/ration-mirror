import { drizzle } from "drizzle-orm/d1";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { data, Link, useFetcher, useLoaderData, useParams } from "react-router";
import { ClipboardIcon } from "~/components/icons/PageIcons";
import { PurchaseQuantityModal } from "~/components/supply/PurchaseQuantityModal";
import * as schema from "~/db/schema";
import { getAuth } from "~/lib/auth.server";
import { DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { getSupplyListByShareToken } from "~/lib/supply.server";
import type { Route } from "./+types/shared.$token";

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

export const meta: Route.MetaFunction = ({ data }) => {
	if (!data?.list) {
		return [{ title: "List Not Found - Ration" }];
	}
	return [
		{ title: `${data.list.name} - Shared List - Ration` },
		{ name: "description", content: `Shared supply list: ${data.list.name}` },
	];
};

export async function loader({ context, params, request }: Route.LoaderArgs) {
	const clientIp =
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
		"unknown";
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"shared_public",
		clientIp,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests" },
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	const token = params.token;

	if (!token) {
		throw data({ error: "Invalid share link" }, { status: 400 });
	}

	const list = await getSupplyListByShareToken(
		context.cloudflare.env.DB,
		token,
	);

	if (!list) {
		throw data({ error: "List not found or link expired" }, { status: 404 });
	}

	// Determine if the viewer is an admin/owner of the list's organization,
	// which grants them the ability to add items directly from this shared view.
	let canAddItems = false;
	try {
		const auth = getAuth(context.cloudflare.env);
		const session = await auth.api.getSession({ headers: request.headers });
		if (session) {
			const db = drizzle(context.cloudflare.env.DB, { schema });
			const membership = await db.query.member.findFirst({
				where: (m, { and, eq: deq }) =>
					and(
						deq(m.organizationId, list.organizationId),
						deq(m.userId, session.user.id),
					),
			});
			if (membership && ["owner", "admin"].includes(membership.role)) {
				canAddItems = true;
			}
		}
	} catch {
		// Non-critical — fall back to read-only view
	}

	return { list, canAddItems };
}

function SharedGroceryItem({
	item,
	token,
	onOptimisticToggle,
	onOptimisticUpdate,
}: {
	item: SharedItem;
	token: string | undefined;
	onOptimisticToggle: (itemId: string, isPurchased: boolean) => void;
	onOptimisticUpdate: (
		itemId: string,
		isPurchased: boolean,
		quantity: number,
		unit: string,
	) => void;
}) {
	const fetcher = useFetcher();
	const [showPurchaseModal, setShowPurchaseModal] = useState(false);
	const [isMarkingPurchased, setIsMarkingPurchased] = useState(false);
	const isPending = fetcher.state !== "idle";

	const optimisticPurchased =
		isMarkingPurchased ||
		(fetcher.formData?.get("isPurchased") !== undefined
			? fetcher.formData.get("isPurchased") === "true"
			: item.isPurchased);

	const handleToggle = () => {
		if (!token || isPending) return;
		if (item.isPurchased) {
			const nextPurchased = false;
			onOptimisticToggle(item.id, nextPurchased);
			fetcher.submit(
				{ isPurchased: "false" },
				{
					method: "PATCH",
					action: `/api/shared/${token}/items/${item.id}`,
					encType: "application/json",
				},
			);
		} else {
			setShowPurchaseModal(true);
		}
	};

	const handlePurchaseConfirm = (quantity: number, unit: string) => {
		setShowPurchaseModal(false);
		setIsMarkingPurchased(true);
		onOptimisticUpdate(item.id, true, quantity, unit);
		fetcher.submit(JSON.stringify({ isPurchased: true, quantity, unit }), {
			method: "PATCH",
			action: `/api/shared/${token}/items/${item.id}`,
			encType: "application/json",
		});
	};

	useEffect(() => {
		if (fetcher.state === "idle") {
			setIsMarkingPurchased(false);
		}
	}, [fetcher.state]);

	return (
		<li
			className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
				optimisticPurchased
					? "bg-platinum/50 opacity-60"
					: "bg-ceramic hover:bg-platinum/30"
			}`}
		>
			<button
				type="button"
				onClick={handleToggle}
				disabled={!token || isPending}
				className={`w-5 h-5 flex items-center justify-center rounded-md border-2 transition-all ${
					optimisticPurchased
						? "border-hyper-green bg-hyper-green text-white"
						: "border-muted hover:border-hyper-green"
				}`}
				aria-label={
					optimisticPurchased ? "Mark as not purchased" : "Mark as purchased"
				}
			>
				{optimisticPurchased && (
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
			</button>
			<span
				className={`flex-1 ${optimisticPurchased ? "line-through text-muted" : "text-carbon"}`}
			>
				{item.name}
			</span>
			{item.quantity > 1 && (
				<span className="text-sm text-muted">
					{item.quantity} {item.unit}
				</span>
			)}
			{showPurchaseModal && (
				<PurchaseQuantityModal
					itemName={item.name}
					quantity={item.quantity}
					unit={item.unit ?? "unit"}
					onConfirm={handlePurchaseConfirm}
					onCancel={() => setShowPurchaseModal(false)}
					isPending={isPending}
				/>
			)}
		</li>
	);
}

function AdminAddItemBar({
	token,
	onItemAdded,
}: {
	token: string;
	onItemAdded: (item: SharedItem) => void;
}) {
	const fetcher = useFetcher<{ item?: SharedItem; error?: string }>();
	const [name, setName] = useState("");
	const [domain, setDomain] = useState<string>("food");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data?.item) {
			onItemAdded(fetcher.data.item);
			setName("");
			inputRef.current?.focus();
		}
	}, [fetcher.state, fetcher.data, onItemAdded]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		fetcher.submit(JSON.stringify({ name: trimmed, domain }), {
			method: "POST",
			action: `/api/shared/${token}/items`,
			encType: "application/json",
		});
	};

	const isPending = fetcher.state !== "idle";

	return (
		<div className="glass-panel rounded-xl p-4">
			<p className="text-[10px] font-bold uppercase tracking-wider text-hyper-green mb-3">
				Admin — Add Item
			</p>
			<form onSubmit={handleSubmit} className="flex gap-2">
				<input
					ref={inputRef}
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Item name..."
					disabled={isPending}
					className="flex-1 min-w-0 bg-white/60 border border-carbon/10 rounded-lg px-3 py-2 text-sm text-carbon placeholder:text-muted/60 focus:outline-none focus:border-hyper-green/50 disabled:opacity-50"
				/>
				<select
					value={domain}
					onChange={(e) => setDomain(e.target.value)}
					disabled={isPending}
					className="bg-white/60 border border-carbon/10 rounded-lg px-2 py-2 text-sm text-carbon focus:outline-none focus:border-hyper-green/50 disabled:opacity-50"
				>
					{ITEM_DOMAINS.map((d) => (
						<option key={d} value={d}>
							{DOMAIN_LABELS[d]}
						</option>
					))}
				</select>
				<button
					type="submit"
					disabled={isPending || !name.trim()}
					className="px-4 py-2 bg-hyper-green text-carbon font-semibold text-sm rounded-lg hover:bg-hyper-green/90 transition-colors disabled:opacity-50 shrink-0"
				>
					{isPending ? "Adding..." : "Add"}
				</button>
			</form>
			{fetcher.data?.error && (
				<p className="text-xs text-danger mt-2">{fetcher.data.error}</p>
			)}
		</div>
	);
}

export default function SharedListPage() {
	const { list, canAddItems } = useLoaderData<{
		list: SharedList;
		canAddItems: boolean;
	}>();
	const { token } = useParams();
	const [items, setItems] = useState<SharedItem[]>(list.items);

	const handleOptimisticToggle = useCallback(
		(itemId: string, isPurchased: boolean) => {
			setItems((current) =>
				current.map((i) => (i.id === itemId ? { ...i, isPurchased } : i)),
			);
		},
		[],
	);

	const handleOptimisticUpdate = useCallback(
		(itemId: string, isPurchased: boolean, quantity: number, unit: string) => {
			setItems((current) =>
				current.map((i) =>
					i.id === itemId ? { ...i, isPurchased, quantity, unit } : i,
				),
			);
		},
		[],
	);

	const handleItemAdded = useCallback((item: SharedItem) => {
		setItems((current) => [...current, item]);
	}, []);

	const groupedItems = useMemo(
		() =>
			items.reduce<Record<string, SharedItem[]>>((acc, item) => {
				const domain = item.domain || "food";
				if (!acc[domain]) acc[domain] = [];
				acc[domain].push(item);
				return acc;
			}, {}),
		[items],
	);

	const purchased = items.filter((i) => i.isPurchased).length;
	const total = items.length;
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
				{canAddItems && token && (
					<AdminAddItemBar token={token} onItemAdded={handleItemAdded} />
				)}
				{items.length === 0 ? (
					<div className="text-center py-16 glass-panel rounded-2xl">
						<div className="flex justify-center mb-4">
							<ClipboardIcon className="w-12 h-12 text-muted/40" />
						</div>
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
									<SharedGroceryItem
										key={item.id}
										item={item}
										token={token}
										onOptimisticToggle={handleOptimisticToggle}
										onOptimisticUpdate={handleOptimisticUpdate}
									/>
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
						Create your own smart supply lists →
					</Link>
				</div>
			</footer>
		</div>
	);
}
