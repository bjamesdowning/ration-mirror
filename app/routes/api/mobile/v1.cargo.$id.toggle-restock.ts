import { data } from "react-router";
import {
	toggleCargoSelection,
	validateCargoOwnership,
} from "~/lib/cargo-selection.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/v1.cargo.$id.toggle-restock";

export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);
		const cargoId = params.id;
		if (!cargoId) {
			throw data({ error: "Missing cargo ID" }, { status: 400 });
		}

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

		try {
			await validateCargoOwnership(
				context.cloudflare.env.DB,
				organizationId,
				cargoId,
			);
		} catch {
			throw data(
				{ error: "Cargo item not found or unauthorized" },
				{ status: 404 },
			);
		}

		const result = await toggleCargoSelection(
			context.cloudflare.env.DB,
			organizationId,
			cargoId,
		);

		return { success: true, cargoId, ...result };
	} catch (e) {
		return handleApiError(e);
	}
}
