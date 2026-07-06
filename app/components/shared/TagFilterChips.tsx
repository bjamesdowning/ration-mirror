import { FilterChip } from "~/components/shell/FilterSheet";
import type { TagRecord } from "~/lib/tags";

interface TagFilterChipsProps {
	label?: string;
	tags: TagRecord[];
	activeSlugs: string[];
	onToggle: (slug: string) => void;
}

export function TagFilterChips({
	label = "Tags",
	tags,
	activeSlugs,
	onToggle,
}: TagFilterChipsProps) {
	if (tags.length === 0) return null;

	return (
		<div>
			<h4 className="text-sm font-medium text-muted mb-3">{label}</h4>
			<div className="flex flex-wrap gap-2">
				{tags.map((tag) => (
					<FilterChip
						key={tag.id}
						label={tag.name}
						isActive={activeSlugs.includes(tag.slug)}
						onClick={() => onToggle(tag.slug)}
					/>
				))}
			</div>
		</div>
	);
}
