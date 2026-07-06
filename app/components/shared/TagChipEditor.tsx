import { useMemo, useState } from "react";
import {
	formatTagName,
	MAX_TAGS_PER_ENTITY,
	normalizeTagSlug,
	tagsToSearchParam,
} from "~/lib/tags";
import { TagChip } from "./TagChip";

interface TagChipEditorProps {
	name?: string;
	defaultSlugs?: string[];
	value?: string[];
	onChange?: (slugs: string[]) => void;
	suggestions?: string[];
	maxTags?: number;
	placeholder?: string;
}

export function TagChipEditor({
	name = "tags",
	defaultSlugs = [],
	value,
	onChange,
	suggestions = [],
	maxTags = MAX_TAGS_PER_ENTITY,
	placeholder = "Add tag",
}: TagChipEditorProps) {
	const [internalTags, setInternalTags] = useState<string[]>(() =>
		defaultSlugs.map(normalizeTagSlug).filter(Boolean),
	);
	const tags = value ?? internalTags;
	const setTags = onChange ?? setInternalTags;
	const [draft, setDraft] = useState("");

	const filteredSuggestions = useMemo(() => {
		const needle = draft.trim().toLowerCase();
		if (!needle) return [];
		return suggestions
			.filter(
				(s) =>
					s.toLowerCase().includes(needle) &&
					!tags.includes(normalizeTagSlug(s)),
			)
			.slice(0, 6);
	}, [draft, suggestions, tags]);

	const addTag = (raw: string) => {
		const slug = normalizeTagSlug(raw);
		if (!slug || tags.includes(slug) || tags.length >= maxTags) return;
		setTags([...tags, slug]);
	};

	const removeTag = (slug: string) => {
		setTags(tags.filter((t) => t !== slug));
	};

	const commitDraft = () => {
		if (!draft.trim()) return;
		addTag(draft);
		setDraft("");
	};

	return (
		<div className="space-y-2">
			{name ? (
				<input type="hidden" name={name} value={tagsToSearchParam(tags)} />
			) : null}

			{tags.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{tags.map((slug) => (
						<span key={slug} className="inline-flex items-center gap-1">
							<TagChip tag={{ slug, name: formatTagName(slug) }} size="sm" />
							<button
								type="button"
								onClick={() => removeTag(slug)}
								className="text-muted hover:text-carbon text-sm leading-none min-w-[24px] min-h-[24px]"
								aria-label={`Remove tag ${slug}`}
							>
								×
							</button>
						</span>
					))}
				</div>
			)}

			<input
				type="text"
				inputMode="text"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === ",") {
						e.preventDefault();
						commitDraft();
					}
				}}
				onBlur={commitDraft}
				placeholder={placeholder}
				className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
			/>

			{filteredSuggestions.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{filteredSuggestions.map((suggestion) => (
						<button
							key={suggestion}
							type="button"
							onClick={() => {
								addTag(suggestion);
								setDraft("");
							}}
							className="text-xs px-2 py-1 rounded-full bg-hyper-green/15 text-hyper-green hover:bg-hyper-green/25 transition-colors"
						>
							{suggestion}
						</button>
					))}
				</div>
			)}

			<span className="text-xs text-muted">
				{tags.length}/{maxTags} tags
			</span>
		</div>
	);
}
