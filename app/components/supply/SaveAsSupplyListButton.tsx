import { useState } from "react";
import { useFetcher, useRouteLoaderData } from "react-router";

export function SaveAsSupplyListButton({
	scanRequestId,
	items,
}: {
	scanRequestId?: string;
	items: Array<{
		name: string;
		quantity: number;
		unit: string;
		domain?: string;
		selected?: boolean;
	}>;
}) {
	const fetcher = useFetcher();
	const [name, setName] = useState(
		() => `Receipt ${new Date().toLocaleDateString()}`,
	);
	const root = useRouteLoaderData("root") as
		| { clientFlags?: { supplyMultiLists?: boolean } }
		| undefined;
	if (!root?.clientFlags?.supplyMultiLists || !scanRequestId) return null;

	const selected = items.filter((item) => item.selected !== false);
	return (
		<div className="flex flex-col gap-2 rounded-xl border border-platinum p-3">
			<label className="text-sm font-semibold" htmlFor="save-supply-list-name">
				Save reviewed items as list
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
				{fetcher.state === "idle" ? "Save as Supply list" : "Saving…"}
			</button>
		</div>
	);
}
