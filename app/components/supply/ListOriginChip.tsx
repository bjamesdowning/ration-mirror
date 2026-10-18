import { originLabel } from "~/lib/supply-saved-status";

export function ListOriginChip({ createdFrom }: { createdFrom: string }) {
	return (
		<span className="inline-flex items-center rounded-full border border-platinum bg-platinum/40 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-carbon">
			{originLabel(createdFrom)}
		</span>
	);
}
