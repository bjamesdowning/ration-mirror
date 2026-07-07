import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { handleApiError, retryOnD1Contention } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { requireMobileAuth } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { purgeUserAccount } from "~/lib/user-purge.server";
import type { Route } from "./+types/v1.account";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "DELETE") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId } = await requireMobileAuth(context, request);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"user_purge",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Account deletion is rate limited. Please try again later." },
				{ status: 429, headers: { "Retry-After": "300" } },
			);
		}

		const db = drizzle(context.cloudflare.env.DB, { schema });
		const user = await db.query.user.findFirst({
			where: eq(schema.user.id, userId),
			columns: { id: true, email: true },
		});
		if (!user) {
			throw data({ error: "Not Found" }, { status: 404 });
		}

		try {
			await retryOnD1Contention(() =>
				purgeUserAccount(context.cloudflare.env, {
					userId: user.id,
					email: user.email,
				}),
			);
		} catch (error) {
			log.error("[Purge] account deletion failed", {
				userId: redactId(userId),
				errorMessage: error instanceof Error ? error.message : String(error),
			});
			return handleApiError(error);
		}

		return { success: true, deleted: true };
	} catch (e) {
		return handleApiError(e);
	}
}
