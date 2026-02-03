import type { LoaderFunctionArgs } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	exportGroceryListAsMarkdown,
	exportGroceryListAsText,
} from "~/lib/export.server";
import { getGroceryList } from "~/lib/grocery.server";

/**
 * GET /api/grocery-lists/:id/export - Export grocery list as text
 * Query params:
 *   - format: 'text' | 'markdown' (default: 'text')
 */
export async function loader({ request, context, params }: LoaderFunctionArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw new Response("List ID required", { status: 400 });
	}

	const list = await getGroceryList(context.cloudflare.env.DB, groupId, listId);

	if (!list) {
		throw new Response("Grocery list not found", { status: 404 });
	}

	const url = new URL(request.url);
	const format = url.searchParams.get("format") || "text";

	let content: string;
	let contentType: string;

	if (format === "markdown") {
		content = exportGroceryListAsMarkdown(list);
		contentType = "text/markdown; charset=utf-8";
	} else {
		content = exportGroceryListAsText(list);
		contentType = "text/plain; charset=utf-8";
	}

	return new Response(content, {
		headers: {
			"Content-Type": contentType,
			"Content-Disposition": `attachment; filename="${list.name}.${format === "markdown" ? "md" : "txt"}"`,
		},
	});
}
