import { MAX_TAGS_PER_ENTITY } from "~/lib/tags";

export type StoredDiaryTag = {
	name: string;
	slug?: string;
};

type TagInput = string | { name: string; slug?: string };

/** Empty and omitted lists store null. Names stay display names. */
export function storedDiaryTagNames(
	value: TagInput[] | null | undefined,
): StoredDiaryTag[] | null {
	if (!value || value.length === 0) return null;
	const tags: StoredDiaryTag[] = [];
	for (const entry of value.slice(0, MAX_TAGS_PER_ENTITY)) {
		if (typeof entry === "string") {
			const name = entry.trim();
			if (name.length > 0) tags.push({ name });
			continue;
		}
		const name = entry.name.trim();
		if (name.length === 0) continue;
		const slug = entry.slug?.trim();
		if (slug) tags.push({ name, slug });
		else tags.push({ name });
	}
	return tags.length > 0 ? tags : null;
}
