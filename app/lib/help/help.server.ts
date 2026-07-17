import {
	getHelpArticleMeta,
	type HelpArticleMeta,
	isHelpArticleSlug,
} from "./articles";

const FIN_GLOB = import.meta.glob<string>("../../../docs/fin/*.md", {
	query: "?raw",
	import: "default",
	eager: true,
});

function slugFromPath(filePath: string): string {
	const match = filePath.match(/fin\/(.+)\.md$/);
	return match ? match[1] : filePath;
}

const CONTENT_BY_SLUG: Map<string, string> = (() => {
	const map = new Map<string, string>();
	for (const [path, content] of Object.entries(FIN_GLOB)) {
		map.set(slugFromPath(path), content);
	}
	return map;
})();

export type HelpArticle = HelpArticleMeta & { content: string };

export function getHelpDirectoryMarkdown(): string | null {
	return CONTENT_BY_SLUG.get("DIRECTORY") ?? null;
}

export function getHelpArticle(slug: string): HelpArticle | null {
	if (!isHelpArticleSlug(slug)) return null;
	const meta = getHelpArticleMeta(slug);
	const content = CONTENT_BY_SLUG.get(slug);
	if (!meta || !content) return null;
	return { ...meta, content };
}

export function listHelpArticleSlugs(): string[] {
	return [...CONTENT_BY_SLUG.keys()].filter(isHelpArticleSlug);
}
