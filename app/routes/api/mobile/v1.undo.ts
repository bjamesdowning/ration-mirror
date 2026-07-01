import { data } from "react-router";
import { applyUndoRecord } from "~/lib/cook-reversal.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { UndoActionSchema } from "~/lib/schemas/mobile/undo";
import { consumeUndoToken } from "~/lib/undo-token.server";
import type { Route } from "./+types/v1.undo";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"meal_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const body = await request.json();
		const { token } = UndoActionSchema.parse(body);
		const record = await consumeUndoToken(
			context.cloudflare.env.RATION_KV,
			token,
			userId,
			organizationId,
		);

		if (!record) {
			throw data({ error: "Undo expired or unavailable" }, { status: 410 });
		}

		await applyUndoRecord(context.cloudflare.env.DB, organizationId, record);

		return { success: true, kind: record.kind };
	} catch (e) {
		return handleApiError(e);
	}
}
