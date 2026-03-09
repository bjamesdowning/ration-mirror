import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { getAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { SupplyItemSchema } from "~/lib/schemas/supply";
import { addSupplyItem, getSupplyListByShareToken } from "~/lib/supply.server";
import type { Route } from "./+types/shared.$token.items";

/**
 * POST /api/shared/:token/items - Add an item to a shared supply list.
 *
 * Requires the caller to be authenticated AND be an admin or owner
 * of the organization that owns the list.
 */
export async function action({ request, context, params }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	const token = params.token;
	if (!token) {
		throw data({ error: "Token required" }, { status: 400 });
	}

	// Optional auth — return 401 if not authenticated
	const auth = getAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		throw data({ error: "Authentication required" }, { status: 401 });
	}

	const userId = session.user.id;

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"grocery_mutation",
		userId,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
				},
			},
		);
	}

	try {
		const list = await getSupplyListByShareToken(
			context.cloudflare.env.DB,
			token,
		);

		if (!list) {
			throw data({ error: "List not found or link expired" }, { status: 404 });
		}

		const db = drizzle(context.cloudflare.env.DB, { schema });

		const membership = await db.query.member.findFirst({
			where: (m, { and, eq: deq }) =>
				and(deq(m.organizationId, list.organizationId), deq(m.userId, userId)),
		});

		if (!membership || !["owner", "admin"].includes(membership.role)) {
			throw data(
				{
					error:
						"Only admins and owners of this group can add items via a shared list",
				},
				{ status: 403 },
			);
		}

		const json = await request.json();
		const input = SupplyItemSchema.parse(json);

		const item = await addSupplyItem(
			context.cloudflare.env.DB,
			list.organizationId,
			list.id,
			input,
		);

		return { item };
	} catch (e) {
		return handleApiError(e);
	}
}
