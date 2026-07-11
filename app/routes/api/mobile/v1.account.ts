import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { handleApiError, retryOnD1Contention } from "~/lib/error-handler";
import { log, redactId } from "~/lib/logging.server";
import { requireMobileUserAuth } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { purgeUserAccount } from "~/lib/user-purge.server";
import type { Route } from "./+types/v1.account";

/** Groups the user solely owns that will be deleted during account purge. */
async function ownedGroupsWithNoOtherMembers(
	env: Cloudflare.Env,
	userId: string,
): Promise<string[]> {
	const db = drizzle(env.DB, { schema });
	const memberships = await db.query.member.findMany({
		where: eq(schema.member.userId, userId),
		with: {
			organization: {
				columns: { id: true, name: true },
			},
		},
	});

	const owned = memberships.filter((m) => m.role === "owner");
	const soloOwned: string[] = [];

	for (const membership of owned) {
		const orgMembers = await db
			.select({ id: schema.member.id })
			.from(schema.member)
			.where(eq(schema.member.organizationId, membership.organizationId));
		if (orgMembers.length === 1) {
			soloOwned.push(membership.organization.name);
		}
	}

	return soloOwned;
}

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId } = await requireMobileUserAuth(context, request);
		const ownedGroups = await ownedGroupsWithNoOtherMembers(
			context.cloudflare.env,
			userId,
		);
		return { ownedGroupsWithNoOtherMembers: ownedGroups };
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "DELETE") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId } = await requireMobileUserAuth(context, request);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"user_purge",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Account deletion is rate limited. Please try again later.",
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
