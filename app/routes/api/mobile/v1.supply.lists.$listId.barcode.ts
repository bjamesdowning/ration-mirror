import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { buildMobileFlagContext } from "~/lib/feature-flags/context.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { SupplyBarcodeLookupSchema } from "~/lib/schemas/supply-lists";
import { addSupplyItem } from "~/lib/supply.server";
import { lookupSupplyBarcode } from "~/lib/supply-barcode.server";
import { resolveSupplyListTarget } from "~/lib/supply-list-access.server";
import { assertSupplyMultiListsEnabled } from "~/lib/supply-list-flag.server";
import type { Route } from "./+types/v1.supply.lists.$listId.barcode";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}
	const listId = params.listId;
	if (!listId) throw data({ error: "List ID required" }, { status: 400 });
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const env = context.cloudflare.env;
		const flagContext = buildMobileFlagContext(request, env, {
			user: { id: userId },
		});
		await assertSupplyMultiListsEnabled(env, flagContext);
		await resolveSupplyListTarget({
			env,
			organizationId,
			listId,
			flagContext,
			allowedStates: ["live", "saved"],
		});
		const input = SupplyBarcodeLookupSchema.parse(await request.json());
		const lookup = await lookupSupplyBarcode(env, input.barcode);
		const item = await addSupplyItem(env.DB, organizationId, listId, {
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
