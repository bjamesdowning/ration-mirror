import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { SupplyStoreProfileSchema } from "~/lib/schemas/supply-lists";
import { assertSupplyMultiListsEnabled } from "~/lib/supply-list-flag.server";
import {
	deleteSupplyStore,
	listSupplyStores,
	upsertSupplyStore,
} from "~/lib/supply-lists.server";
import type { Route } from "./+types/supply-stores";

export async function loader({ request, context }: Route.LoaderArgs) {
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
		return { stores: await listSupplyStores(env.DB, groupId) };
	} catch (error) {
		return handleApiError(error);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
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
		if (request.method === "POST" || request.method === "PUT") {
			const input = SupplyStoreProfileSchema.parse(await request.json());
			const body = input as typeof input & { id?: string };
			const store = await upsertSupplyStore(env.DB, groupId, {
				id: request.method === "PUT" ? body.id : undefined,
				name: input.name,
				aisles: input.aisles,
			});
			return { store };
		}
		if (request.method === "DELETE") {
			const body = (await request.json()) as { id?: string };
			if (!body.id) throw data({ error: "id required" }, { status: 400 });
			return deleteSupplyStore(env.DB, groupId, body.id);
		}
		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (error) {
		return handleApiError(error);
	}
}
