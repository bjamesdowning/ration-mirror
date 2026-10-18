import { useState } from "react";
import { Link, useFetcher, useRouteLoaderData } from "react-router";
import { receiptListName } from "~/lib/supply-saved-status";

export function SaveAsSupplyListButton({
	scanRequestId,
	items,
	storeName,
}: {
	scanRequestId?: string;
	items: Array<{
		name: string;
		quantity: number;
		unit: string;
		domain?: string;
		selected?: boolean;
	}>;
	storeName?: string | null;
}) {
	const fetcher = useFetcher<{ list?: { id: string }; error?: string }>();
	const [name, setName] = useState(() =>
		receiptListName(new Date(), storeName),
	);
	const root = useRouteLoaderData("root") as
		| { clientFlags?: { supplyMultiLists?: boolean } }
		| undefined;
	if (!root?.clientFlags?.supplyMultiLists || !scanRequestId) return null;

	const selected = items.filter((item) => item.selected !== false);
	const savedId = fetcher.data?.list?.id;
	return (
		<div className="flex flex-col gap-2 rounded-xl border border-platinum p-3">
			<label className="text-sm font-semibold" htmlFor="save-supply-list-name">
				Save as saved list
			</label>
			<input
				id="save-supply-list-name"
				className="min-h-11 rounded-lg border border-platinum px-3"
				value={name}
				onChange={(event) => setName(event.target.value)}
			/>
			<button
				type="button"
				className="min-h-11 rounded-lg bg-hyper-green px-3 font-semibold text-on-hyper-green"
				disabled={fetcher.state !== "idle" || selected.length === 0}
				onClick={() => {
					fetcher.submit(
						JSON.stringify({
							scanRequestId,
							name,
							items: selected.map((item) => ({
								name: item.name,
								quantity: item.quantity,
								unit: item.unit,
								domain: item.domain ?? "food",
							})),
						}),
						{
							method: "POST",
							action: "/api/supply-lists/from-receipt",
							encType: "application/json",
						},
					);
				}}
			>
				{fetcher.state === "idle" ? "Save as saved list" : "Saving…"}
			</button>
			{savedId ? (
				<Link
					to={`/hub/supply/lists/${savedId}`}
					className="text-sm font-semibold text-hyper-green"
				>
					Open saved list
				</Link>
			) : null}
			{fetcher.data?.error ? (
				<p className="text-sm text-danger">{fetcher.data.error}</p>
			) : null}
		</div>
	);
}
