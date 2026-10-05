import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { SupplyBarcodeLookupSchema } from "~/lib/schemas/supply-lists";
import { addSupplyItem } from "~/lib/supply.server";
import { lookupSupplyBarcode } from "~/lib/supply-barcode.server";
import { resolveSupplyListTarget } from "~/lib/supply-list-access.server";
import { assertSupplyMultiListsEnabled } from "~/lib/supply-list-flag.server";
import type { Route } from "./+types/supply-lists.$id.barcode";

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
		const flagContext = buildWebFlagContext(request, env, { user });
		await assertSupplyMultiListsEnabled(env, flagContext);
		await resolveSupplyListTarget({
			env,
			organizationId: groupId,
			listId: params.id,
			flagContext,
			allowedStates: ["live", "saved"],
		});
		const input = SupplyBarcodeLookupSchema.parse(await request.json());
		const lookup = await lookupSupplyBarcode(env, input.barcode);
		const item = await addSupplyItem(env.DB, groupId, params.id, {
			name: lookup.name,
			quantity: 1,
			unit: "unit",
			domain: "food",
		});
		return { item, lookup };
	} catch (error) {
		return handleApiError(error);
	}
}
