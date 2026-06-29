import { data } from "react-router";
import { getCargoItem, jettisonItem, updateItem } from "~/lib/cargo.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MobileUpdateCargoSchema } from "~/lib/schemas/mobile/cargo";
import type { Route } from "./+types/v1.cargo.$id";

export async function loader({ request, context, params }: Route.LoaderArgs) {
	try {
		const { organizationId } = await requireMobileActiveGroup(context, request);
		const id = params.id;
		if (!id) throw data({ error: "Not Found" }, { status: 404 });

		const item = await getCargoItem(
			context.cloudflare.env.DB,
			organizationId,
			id,
		);
		if (!item) throw data({ error: "Not Found" }, { status: 404 });
		return { item };
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context, params }: Route.ActionArgs) {
	const id = params.id;
	if (!id) throw data({ error: "Not Found" }, { status: 404 });

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"inventory_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		if (request.method === "DELETE") {
			const existing = await getCargoItem(
				context.cloudflare.env.DB,
				organizationId,
				id,
			);
			if (!existing) throw data({ error: "Not Found" }, { status: 404 });
			await jettisonItem(context.cloudflare.env, organizationId, id);
			return { success: true };
		}

		if (request.method === "PATCH") {
			const body = await request.json();
			const input = MobileUpdateCargoSchema.parse(body);
			const updated = await updateItem(
				context.cloudflare.env,
				organizationId,
				id,
				input,
			);
			if (!updated) throw data({ error: "Not Found" }, { status: 404 });
			return { item: updated };
		}

		throw data({ error: "Method not allowed" }, { status: 405 });
	} catch (e) {
		return handleApiError(e);
	}
}
