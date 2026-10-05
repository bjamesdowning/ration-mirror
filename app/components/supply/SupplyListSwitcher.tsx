import { useNavigate } from "react-router";

type CatalogSummary = {
	id: string;
	name: string;
	state: string;
};

type Catalog = {
	live: CatalogSummary | null;
	saved: CatalogSummary[];
	templates: CatalogSummary[];
	archived: CatalogSummary[];
	capacity: { current: number; limit: number; canAdd: number };
};

export function SupplyListSwitcher({
	catalog,
	selectedId,
	onCreate,
	onSnapshot,
}: {
	catalog: Catalog;
	selectedId: string;
	onCreate: () => void;
	onSnapshot: () => void;
}) {
	const navigate = useNavigate();
	const options = [
		...(catalog.live ? [catalog.live] : []),
		...catalog.saved,
		...catalog.templates,
		...catalog.archived,
	];
	const atCap =
		catalog.capacity.limit !== -1 &&
		catalog.capacity.current >= catalog.capacity.limit;

	return (
		<div className="flex flex-wrap items-center gap-2">
			<label className="sr-only" htmlFor="supply-list-switcher">
				Supply list
			</label>
			<select
				id="supply-list-switcher"
				className="min-h-11 rounded-lg border border-platinum bg-white px-3 py-2 text-sm font-semibold"
				value={selectedId}
				onChange={(event) => {
					const id = event.target.value;
					const liveId = catalog.live?.id;
					const next = id === liveId ? "/hub/supply" : `/hub/supply?list=${id}`;
					navigate(next);
				}}
			>
				{options.map((list) => (
					<option key={list.id} value={list.id}>
						{list.state === "live"
							? "Supply (Live)"
							: `${list.name} (${list.state})`}
					</option>
				))}
			</select>
			<button
				type="button"
				className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
				onClick={onCreate}
				disabled={atCap}
			>
				New list
			</button>
			<button
				type="button"
				className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
				onClick={onSnapshot}
				disabled={atCap}
			>
				Save Live as list
			</button>
			<span className="text-xs text-muted">
				{catalog.capacity.current}/
				{catalog.capacity.limit === -1 ? "∞" : catalog.capacity.limit} lists
			</span>
		</div>
	);
}
