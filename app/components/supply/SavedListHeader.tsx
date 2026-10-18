import { useFetcher } from "react-router";
import { ListOriginChip } from "~/components/supply/ListOriginChip";

export function SavedListHeader({
	name,
	createdFrom,
	itemCount,
	missingCount,
	readOnly,
}: {
	name: string;
	createdFrom: string;
	itemCount: number;
	missingCount: number;
	readOnly: boolean;
}) {
	const rename = useFetcher();
	return (
		<header className="glass-panel rounded-2xl p-4">
			<p className="text-xs font-semibold uppercase tracking-widest text-muted">
				Saved list
			</p>
			<div className="mt-2 flex flex-wrap items-center gap-2">
				<ListOriginChip createdFrom={createdFrom} />
				{readOnly ? (
					<h1 className="text-display text-2xl text-carbon">{name}</h1>
				) : (
					<rename.Form
						method="post"
						className="min-w-0 flex-1"
						onSubmit={(event) => {
							const field = event.currentTarget.elements.namedItem("name");
							if (
								field instanceof HTMLInputElement &&
								field.value.trim() === name
							) {
								event.preventDefault();
							}
						}}
					>
						<input type="hidden" name="intent" value="rename" />
						<label className="sr-only" htmlFor="saved-list-name">
							List name
						</label>
						<input
							id="saved-list-name"
							name="name"
							key={name}
							defaultValue={name}
							className="w-full bg-transparent text-display text-2xl text-carbon outline-none"
						/>
					</rename.Form>
				)}
			</div>
			<p className="mt-2 text-sm text-muted">
				Pulls into Live · {itemCount} items · {missingCount} missing
			</p>
		</header>
	);
}
