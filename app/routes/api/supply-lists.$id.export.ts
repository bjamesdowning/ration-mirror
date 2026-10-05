import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	exportGroceryListAsMarkdown,
	exportGroceryListAsText,
} from "~/lib/export.server";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { getSupplyListById } from "~/lib/supply.server";
import { resolveSupplyListTarget } from "~/lib/supply-list-access.server";
import type { Route } from "./+types/supply-lists.$id.export";

/**
 * GET /api/grocery-lists/:id/export - Export grocery list as text
 * Query params:
 *   - format: 'text' | 'markdown' (default: 'text')
 */
export async function loader({ request, context, params }: Route.LoaderArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const listId = params.id;

	if (!listId) {
		throw data({ error: "List ID required" }, { status: 400 });
	}

	await resolveSupplyListTarget({
		env: context.cloudflare.env,
		organizationId: groupId,
		listId,
		flagContext: buildWebFlagContext(request, context.cloudflare.env, { user }),
	});

	const list = await getSupplyListById(
		context.cloudflare.env.DB,
		groupId,
		listId,
	);

	if (!list) {
		throw data({ error: "Grocery list not found" }, { status: 404 });
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
