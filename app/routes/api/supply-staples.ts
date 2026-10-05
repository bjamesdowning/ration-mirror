import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { buildWebFlagContext } from "~/lib/feature-flags/context.server";
import { SupplyStapleSchema } from "~/lib/schemas/supply-lists";
import { assertSupplyMultiListsEnabled } from "~/lib/supply-list-flag.server";
import {
	deleteSupplyStaple,
	listSupplyStaples,
	upsertSupplyStaple,
} from "~/lib/supply-lists.server";
import type { Route } from "./+types/supply-staples";

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
		return { staples: await listSupplyStaples(env.DB, groupId) };
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
		if (request.method === "POST") {
			const input = SupplyStapleSchema.parse(await request.json());
			const staple = await upsertSupplyStaple(env.DB, groupId, input);
			return { staple };
		}
		if (request.method === "DELETE") {
			const body = (await request.json()) as { id?: string };
			if (!body.id) throw data({ error: "id required" }, { status: 400 });
			return deleteSupplyStaple(env.DB, groupId, body.id);
		}
		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (error) {
		return handleApiError(error);
	}
}
