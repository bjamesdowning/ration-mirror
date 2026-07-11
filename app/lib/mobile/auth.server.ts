import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AppLoadContext } from "react-router";
import * as schema from "~/db/schema";
import { throwMobileJsonError } from "~/lib/mobile/responses.server";
import {
	assertMobileOrgMembership,
	verifyMobileAccessToken,
} from "~/lib/mobile/token.server";

export interface MobileAuthContext {
	userId: string;
	organizationId: string;
}

function parseBearerToken(request: Request): string | null {
	const header = request.headers.get("Authorization");
	if (!header?.startsWith("Bearer ")) return null;
	const token = header.slice(7).trim();
	return token.length > 0 ? token : null;
}

/** Verifies the bearer JWT and returns the user id only (no org membership gate). */
export async function requireMobileUserAuth(
	context: AppLoadContext,
	request: Request,
): Promise<{ userId: string }> {
	const token = parseBearerToken(request);
	if (!token) {
		throwMobileJsonError("Unauthorized", 401, "unauthorized");
	}

	try {
		const claims = await verifyMobileAccessToken(context.cloudflare.env, token);
		return { userId: claims.userId };
	} catch {
		throwMobileJsonError("Unauthorized", 401, "unauthorized");
	}
}

export async function requireMobileAuth(
	context: AppLoadContext,
	request: Request,
): Promise<MobileAuthContext> {
	const token = parseBearerToken(request);
	if (!token) {
		throwMobileJsonError("Unauthorized", 401, "unauthorized");
	}

	try {
		const claims = await verifyMobileAccessToken(context.cloudflare.env, token);
		await assertMobileOrgMembership(
			context.cloudflare.env,
			claims.userId,
			claims.organizationId,
		);
		return {
			userId: claims.userId,
			organizationId: claims.organizationId,
		};
	} catch (error) {
		if (error instanceof Error && error.message === "forbidden_org") {
			throwMobileJsonError("Organization access denied", 403, "forbidden_org");
		}
		throwMobileJsonError("Unauthorized", 401, "unauthorized");
	}
}

export async function requireMobileActiveGroup(
	context: AppLoadContext,
	request: Request,
): Promise<MobileAuthContext> {
	const auth = await requireMobileAuth(context, request);
	if (!auth.organizationId) {
		throwMobileJsonError("No active organization", 403, "no_active_org");
	}
	return auth;
}

export async function getMobileUser(env: Cloudflare.Env, userId: string) {
	const db = drizzle(env.DB, { schema });
	return db.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: {
			id: true,
			name: true,
			email: true,
			image: true,
			settings: true,
		},
	});
}

export async function listMobileOrganizations(
	env: Cloudflare.Env,
	userId: string,
	activeOrganizationId: string | null,
) {
	const db = drizzle(env.DB, { schema });
	const memberships = await db.query.member.findMany({
		where: eq(schema.member.userId, userId),
		with: {
			organization: {
				columns: {
					id: true,
					name: true,
					slug: true,
					logo: true,
					credits: true,
				},
			},
		},
	});
	return memberships.map((m) => ({
		id: m.organization.id,
		name: m.organization.name,
		slug: m.organization.slug,
		logo: m.organization.logo,
		credits: m.organization.credits,
		role: m.role,
		isActive: m.organization.id === activeOrganizationId,
	}));
}
