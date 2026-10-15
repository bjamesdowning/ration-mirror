import { useId, useMemo, useRef, useState } from "react";

export interface ComboboxIngredient {
	label: string;
	key: string;
	category: string;
}

interface IngredientComboboxProps {
	ingredients: ComboboxIngredient[];
	value: string;
	onChange: (key: string) => void;
	required?: boolean;
	label: React.ReactNode;
}

/**
 * Filters ingredients by name only (not category), ranking names that start
 * with the query, then names with a word starting with it, then other matches.
 */
export function filterIngredients(
	ingredients: ComboboxIngredient[],
	rawQuery: string,
): ComboboxIngredient[] {
	const q = rawQuery.trim().toLowerCase();
	if (!q) return ingredients;
	const scored: Array<{ item: ComboboxIngredient; rank: number; idx: number }> =
		[];
	ingredients.forEach((item, idx) => {
		const name = item.label.toLowerCase();
		let rank = -1;
		if (name.startsWith(q)) rank = 0;
		else if (name.split(/[\s/(),-]+/).some((w) => w.startsWith(q))) rank = 1;
		else if (name.includes(q) || item.key.includes(q)) rank = 2;
		if (rank >= 0) scored.push({ item, rank, idx });
	});
	return scored
		.sort((a, b) => a.rank - b.rank || a.idx - b.idx)
		.map((s) => s.item);
}

/**
 * Searchable, accessible ingredient picker (WAI-ARIA combobox with listbox popup).
 * Keyboard: ↑/↓ to move, Enter to choose, Escape to close.
 */
export function IngredientCombobox({
	ingredients,
	value,
	onChange,
	required = false,
	label,
}: IngredientComboboxProps) {
	const baseId = useId();
	const inputId = `${baseId}-input`;
	const listId = `${baseId}-list`;
	const selected = ingredients.find((i) => i.key === value);
	const [query, setQuery] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	const text = query ?? selected?.label ?? "";

	const matches = useMemo(
		() => filterIngredients(ingredients, query ?? ""),
		[ingredients, query],
	);

	function choose(item: ComboboxIngredient) {
		onChange(item.key);
		setQuery(null);
		setOpen(false);
	}

	function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setOpen(true);
			setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0)));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActive((a) => Math.max(a - 1, 0));
		} else if (e.key === "Enter") {
			if (open && matches[active]) {
				e.preventDefault();
				choose(matches[active]);
			}
		} else if (e.key === "Escape") {
			setOpen(false);
			setQuery(null);
		}
	}

	const activeId =
		open && matches[active] ? `${listId}-${matches[active].key}` : undefined;

	return (
		<div className="relative">
			<label htmlFor={inputId} className="text-label text-muted mb-1 block">
				{label}
			</label>
			<input
				ref={inputRef}
				id={inputId}
				type="text"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls={open ? listId : undefined}
				aria-activedescendant={activeId}
				aria-required={required}
				autoComplete="off"
				spellCheck={false}
				enterKeyHint="done"
				placeholder="Search ingredients, e.g. flour, butter, honey"
				value={text}
				onFocus={(e) => {
					e.currentTarget.select();
					setOpen(true);
				}}
				onChange={(e) => {
					setQuery(e.target.value);
					setActive(0);
					setOpen(true);
				}}
				onBlur={() => {
					// Delay so a tap on an option registers before the list closes.
					setTimeout(() => {
						setOpen(false);
						setQuery(null);
					}, 120);
				}}
				onKeyDown={onKeyDown}
				className="w-full rounded-lg bg-platinum px-4 py-3 text-base text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
			/>
			{open && (
				<div
					id={listId}
					role="listbox"
					aria-label="Ingredients"
					className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg bg-ceramic shadow-glow border border-carbon/10"
				>
					{matches.length === 0 ? (
						<p className="px-4 py-3 text-sm text-muted">
							No match. Try a simpler name, like "flour" or "sugar".
						</p>
					) : (
						matches.map((item, idx) => (
							<div
								key={item.key}
								id={`${listId}-${item.key}`}
								role="option"
								tabIndex={-1}
								aria-selected={item.key === value}
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => choose(item)}
								onKeyDown={() => undefined}
								className={`flex min-h-[44px] cursor-pointer flex-col justify-center gap-0.5 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
									idx === active ? "bg-hyper-green/10" : ""
								} ${item.key === value ? "font-bold" : ""}`}
							>
								<span className="text-carbon">{item.label}</span>
								<span className="text-xs text-muted sm:shrink-0">
									{item.category}
								</span>
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
}
