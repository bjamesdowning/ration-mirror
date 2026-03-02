import {
	ALLERGEN_LABELS,
	ALLERGEN_SLUGS,
	type AllergenSlug,
} from "~/lib/allergens";

interface AllergenSelectorProps {
	/** Currently selected allergen slugs. */
	selected: AllergenSlug[];
	/** Called with the full new selection whenever a pill is toggled. */
	onChange: (next: AllergenSlug[]) => void;
	disabled?: boolean;
}

export function AllergenSelector({
	selected,
	onChange,
	disabled = false,
}: AllergenSelectorProps) {
	const selectedSet = new Set(selected);

	const toggle = (slug: AllergenSlug) => {
		if (disabled) return;
		if (selectedSet.has(slug)) {
			onChange(selected.filter((s) => s !== slug));
		} else {
			onChange([...selected, slug]);
		}
	};

	return (
		<div className="flex flex-wrap gap-2">
			{ALLERGEN_SLUGS.map((slug) => {
				const active = selectedSet.has(slug);
				return (
					<button
						key={slug}
						type="button"
						onClick={() => toggle(slug)}
						disabled={disabled}
						aria-pressed={active}
						className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
							active
								? "bg-warning/15 text-warning border-warning/40 shadow-sm"
								: "bg-platinum/60 text-muted border-carbon/15 hover:bg-platinum hover:text-carbon"
						} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
					>
						{ALLERGEN_LABELS[slug]}
					</button>
				);
			})}
		</div>
	);
}
