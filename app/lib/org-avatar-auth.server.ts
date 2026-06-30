import { drizzle } from "drizzle-orm/d1";
import type { AppLoadContext } from "react-router";
import * as schema from "~/db/schema";
import { getAuth } from "~/lib/auth.server";
import {
	assertMobileOrgMembership,
	verifyMobileAccessToken,
} from "~/lib/mobile/token.server";

function parseBearerToken(request: Request): string | null {
	const header = request.headers.get("Authorization");
	if (!header?.startsWith("Bearer ")) return null;
	const token = header.slice(7).trim();
	return token.length > 0 ? token : null;
}

/**
 * Resolves the viewer user id for org avatar GET — cookie session or mobile Bearer.
 * Returns null when unauthenticated or not a member of `orgId`.
 */
export async function resolveOrgAvatarViewerUserId(
	context: AppLoadContext,
	request: Request,
	orgId: string,
): Promise<string | null> {
	const bearer = parseBearerToken(request);
	if (bearer) {
		try {
			const claims = await verifyMobileAccessToken(
				context.cloudflare.env,
				bearer,
			);
			await assertMobileOrgMembership(
				context.cloudflare.env,
				claims.userId,
				orgId,
			);
			return claims.userId;
		} catch {
			return null;
		}
	}

	const auth = getAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) return null;

	const db = drizzle(context.cloudflare.env.DB, { schema });
	const membership = await db.query.member.findFirst({
		where: (m, { and, eq }) =>
			and(eq(m.organizationId, orgId), eq(m.userId, session.user.id)),
	});

	return membership ? session.user.id : null;
}
