import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { SupplyAddStaplesSchema } from "~/lib/schemas/supply-lists";
import { assertSupplyMultiListsEnabled } from "~/lib/supply-list-flag.server";
import { addStaplesToList } from "~/lib/supply-lists.server";
import type { Route } from "./+types/supply-lists.$id.add-staples";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	if (!params.id) throw data({ error: "List ID required" }, { status: 400 });
	try {
		const {
			groupId,
			session: { user },
		} = await requireActiveGroup(context, request);
		const env = context.cloudflare.env;
		await assertSupplyMultiListsEnabled(
			env,
			buildWebFlagContext(request, env, { user }),
		);
		const input = SupplyAddStaplesSchema.parse(await request.json());
		const list = await addStaplesToList({
			env,
			organizationId: groupId,
			listId: params.id,
			stapleIds: input.stapleIds,
		});
		return { list };
	} catch (error) {
		return handleApiError(error);
	}
}
