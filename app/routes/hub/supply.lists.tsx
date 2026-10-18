import { useState } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";
import { EmptyPanel } from "~/components/hub/EmptyPanel";
import { ShoppingCartIcon } from "~/components/icons/PageIcons";
import { PageHeader } from "~/components/shell/PageHeader";
import { ListOriginChip } from "~/components/supply/ListOriginChip";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { isSupplyMultiListsEnabled } from "~/lib/supply-list-flag.server";
import {
	createCatalogList,
	getSavedListView,
	getSupplyCatalog,
	snapshotLiveSupplyList,
} from "~/lib/supply-lists.server";
import { previewAddToLive } from "~/lib/supply-saved-status";
import type { Route } from "./+types/supply.lists";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId, session } = await requireActiveGroup(context, request);
	const enabled = await isSupplyMultiListsEnabled(
		context.cloudflare.env,
		buildWebFlagContext(request, context.cloudflare.env, session),
	);
	if (!enabled) throw redirect("/hub/supply");

	const catalog = await getSupplyCatalog(context.cloudflare.env, groupId);
	const lists = [...catalog.saved, ...catalog.templates].sort(
		(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
	);
	const saved = await Promise.all(
		lists.map(async (list) => {
			const view = await getSavedListView(
				context.cloudflare.env,
				groupId,
				list.id,
			);
			const items =
				view && "items" in view
					? view.items.map((item) => ({
							id: item.id,
							name: item.name,
							quantity: item.quantity,
							unit: item.unit,
							inCargo: "inCargo" in item ? item.inCargo : 0,
							live: "live" in item ? item.live : undefined,
						}))
					: [];
			return {
				...list,
				missingCount: previewAddToLive(items, "missing").adding.length,
			};
		}),
	);

	return { catalog, saved, archived: catalog.archived };
}

export async function action({ request, context }: Route.ActionArgs) {
	const { groupId, session } = await requireActiveGroup(context, request);
	const env = context.cloudflare.env;
	const enabled = await isSupplyMultiListsEnabled(
		env,
		buildWebFlagContext(request, env, session),
	);
	if (!enabled) throw redirect("/hub/supply");

	try {
		const formData = await request.formData();
		const intent = formData.get("intent");
		const name = String(formData.get("name") ?? "").trim();
		if (!name) {
			return { error: "Give the list a name." };
		}
		if (intent === "snapshot") {
			const list = await snapshotLiveSupplyList({
				env,
				organizationId: groupId,
				name,
			});
			if (!list) throw redirect("/hub/supply/lists");
			throw redirect(`/hub/supply/lists/${list.id}`);
		}
		const list = await createCatalogList({
			env,
			organizationId: groupId,
			name,
			kind: "saved",
		});
		if (!list) throw redirect("/hub/supply/lists");
		throw redirect(`/hub/supply/lists/${list.id}`);
	} catch (error) {
		if (error instanceof Response) throw error;
		return handleApiError(error);
	}
}

function capacityLabel(current: number, limit: number) {
	if (limit < 0) return `${current} lists`;
	return `${current}/${limit} lists`;
}

export default function SupplyListsLibrary({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { catalog, saved, archived } = loaderData;
	const navigation = useNavigation();
	const [composer, setComposer] = useState<"new" | "snapshot" | null>(null);
	const busy = navigation.state !== "idle";
	const live = catalog.live;
	const toBuy = Math.max(
		0,
		(live?.itemCount ?? 0) - (live?.purchasedCount ?? 0),
	);
	const inCart = live?.purchasedCount ?? 0;

	return (
		<div className="space-y-6 pb-24" data-testid="supply-lists-library">
			<PageHeader
				icon={<ShoppingCartIcon className="w-6 h-6 text-hyper-green" />}
				title="Lists"
			/>
			<nav className="text-sm text-muted">
				<Link to="/hub/supply" className="font-semibold text-carbon">
					Supply
				</Link>
				<span> / Lists</span>
			</nav>
			<p className="text-sm font-semibold text-muted">
				{capacityLabel(catalog.capacity.current, catalog.capacity.limit)}
			</p>
			{actionData && "error" in actionData && actionData.error ? (
				<p className="text-sm font-semibold text-danger">{actionData.error}</p>
			) : null}

			{live ? (
				<Link
					to="/hub/supply"
					className="block rounded-2xl border-2 border-hyper-green bg-white p-4 shadow-glow-sm"
				>
					<p className="text-xs font-bold uppercase tracking-widest text-hyper-green">
						Live
					</p>
					<h2 className="mt-1 text-display text-2xl text-carbon">
						Live Supply
					</h2>
					<p className="mt-1 text-sm text-muted">
						{toBuy} to buy · {inCart} in cart
					</p>
				</Link>
			) : null}

			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					className="btn-secondary min-h-11 rounded-lg px-3 text-sm font-semibold"
					disabled={!catalog.capacity.canAdd || busy}
					onClick={() => setComposer(composer === "new" ? null : "new")}
				>
					New list
				</button>
				<button
					type="button"
					className="btn-secondary min-h-11 rounded-lg px-3 text-sm font-semibold"
					disabled={!catalog.capacity.canAdd || busy}
					onClick={() =>
						setComposer(composer === "snapshot" ? null : "snapshot")
					}
				>
					Save Live as list
				</button>
			</div>
			{composer ? (
				<Form
					method="post"
					className="glass-panel flex flex-col gap-3 rounded-2xl p-4"
				>
					<input type="hidden" name="intent" value={composer} />
					<label className="text-sm font-semibold" htmlFor="new-list-name">
						{composer === "snapshot" ? "Save Live as list" : "New list"}
					</label>
					<input
						id="new-list-name"
						name="name"
						required
						defaultValue={composer === "snapshot" ? "Staples" : "Shopping"}
						className="min-h-11 rounded-lg border border-platinum px-3"
					/>
					<button
						type="submit"
						className="min-h-11 rounded-lg bg-hyper-green px-3 font-bold text-on-hyper-green"
						disabled={busy}
					>
						{busy ? "Saving…" : "Create"}
					</button>
				</Form>
			) : null}

			{saved.length === 0 ? (
				<EmptyPanel
					icon={<ShoppingCartIcon className="w-12 h-12 text-muted" />}
					title="No saved lists"
					description="Lists you pull into Live — staples, party, receipts."
				/>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{saved.map((list) => (
						<li key={list.id}>
							<Link
								to={`/hub/supply/lists/${list.id}`}
								className="block rounded-2xl border border-platinum bg-white p-4"
							>
								<ListOriginChip createdFrom={list.createdFrom} />
								<h3 className="mt-2 text-lg font-semibold text-carbon">
									{list.name}
								</h3>
								<p className="text-sm text-muted">
									{list.itemCount} items · {list.missingCount} missing
								</p>
							</Link>
						</li>
					))}
				</ul>
			)}

			{archived.length > 0 ? (
				<details className="rounded-2xl border border-platinum p-4">
					<summary className="cursor-pointer text-sm font-semibold uppercase tracking-widest text-muted">
						History
					</summary>
					<ul className="mt-3 space-y-2">
						{archived.map((list) => (
							<li key={list.id}>
								<Link
									to={`/hub/supply/lists/${list.id}`}
									className="font-semibold text-carbon"
								>
									{list.name}
								</Link>
								<span className="text-sm text-muted">
									{" "}
									· {list.itemCount} items
								</span>
							</li>
						))}
					</ul>
				</details>
			) : null}
		</div>
	);
}
