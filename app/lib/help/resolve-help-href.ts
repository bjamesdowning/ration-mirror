/**
 * Resolve Markdown hrefs for `/help` rendering.
 * - Same-folder `./slug.md` → `/help/slug`
 * - Site paths `/…` → internal route
 * - External http(s) → external
 * - Repo-relative paths → plain text (not public routes)
 */
export function resolveHelpHref(
	href: string,
):
	| { kind: "internal"; to: string }
	| { kind: "external"; href: string }
	| { kind: "plain" } {
	if (href.startsWith("http://") || href.startsWith("https://")) {
		return { kind: "external", href };
	}
	if (href.startsWith("/")) {
		return { kind: "internal", to: href };
	}
	const mdMatch = href.match(/^\.?\/?([\w-]+)\.md(?:#.*)?$/);
	if (mdMatch) {
		return { kind: "internal", to: `/help/${mdMatch[1]}` };
	}
	if (
		href.startsWith("../") ||
		href.startsWith("./../") ||
		href.includes("/plans/") ||
		href.startsWith("plans/")
	) {
		return { kind: "plain" };
	}
	return { kind: "plain" };
}
