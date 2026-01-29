import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";
import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AppLoadContext } from "react-router";
import { redirect } from "react-router";
import * as schema from "../db/schema";

const DEFAULT_ADMIN = "admin@ration.com";

// Define access control for group management
const statement = {
	...defaultStatements,
	data: ["read", "write"],
	credits: ["purchase"],
} as const;

const ac = createAccessControl(statement);

// Define roles with permissions
const owner = ac.newRole({
	...ownerAc.statements, // Includes default owner permissions
	data: ["read", "write"],
	credits: ["purchase"],
});

const admin = ac.newRole({
	...adminAc.statements, // Includes default admin permissions
	data: ["read", "write"],
	credits: ["purchase"],
});

const member = ac.newRole({
	...memberAc.statements, // Includes default member permissions
	data: ["read", "write"],
});

export function createAuth(env: Cloudflare.Env) {
	const db = drizzle(env.DB, { schema });
	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: {
				user: schema.user,
				session: schema.session,
				account: schema.account,
				verification: schema.verification,
			},
		}),
		plugins: [
			organization({
				ac,
				roles: {
					owner,
					admin,
					member,
				},
				allowUserToCreateOrganization: true,
			}),
		],
		socialProviders: {
			google: {
				clientId: (env as Cloudflare.Env & { GOOGLE_CLIENT_ID: string })
					.GOOGLE_CLIENT_ID,
				clientSecret: (env as Cloudflare.Env & { GOOGLE_CLIENT_SECRET: string })
					.GOOGLE_CLIENT_SECRET,
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						try {
							const db = drizzle(env.DB, { schema });

							// Create personal organization directly
							const personalOrgId = crypto.randomUUID();
							await db.insert(schema.organization).values({
								id: personalOrgId,
								name: `${user.name || "My"}'s Personal Group`,
								slug: `personal-${user.id}`,
								metadata: { isPersonal: true },
								credits: 0,
								createdAt: new Date(),
							});

							// Add user as owner
							await db.insert(schema.member).values({
								id: crypto.randomUUID(),
								organizationId: personalOrgId,
								userId: user.id,
								role: "owner",
								createdAt: new Date(),
							});

							console.log(
								`[Auth] Created personal group ${personalOrgId} for user ${user.id}`,
							);
						} catch (error) {
							console.error(
								`[Auth] Failed to create personal group for user ${user.id}:`,
								error,
							);
							// Don't throw - user can manually create a group
						}
					},
				},
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Helper function to auto-activate personal organization if no active org is set.
 * Should be called in loaders/actions after getting session.
 */
export async function ensureActiveOrganization(
	env: Cloudflare.Env,
	session: NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>,
): Promise<NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>> {
	if (session.session.activeOrganizationId) {
		return session; // Already has active org
	}

	try {
		const db = drizzle(env.DB, { schema });

		// Find user's personal group
		const personalGroup = await db.query.organization.findFirst({
			where: like(schema.organization.slug, `personal-${session.user.id}`),
		});

		if (personalGroup) {
			// Set as active organization
			await db
				.update(schema.session)
				.set({ activeOrganizationId: personalGroup.id })
				.where(eq(schema.session.id, session.session.id));

			console.log(
				`[Auth] Auto-activated personal group ${personalGroup.id} for session ${session.session.id}`,
			);

			// Return updated session
			return {
				...session,
				session: {
					...session.session,
					activeOrganizationId: personalGroup.id,
				},
			};
		}
	} catch (error) {
		console.error("[Auth] Failed to auto-activate organization:", error);
	}

	return session;
}

export async function requireAuth(context: AppLoadContext, request: Request) {
	const auth = createAuth(context.cloudflare.env);
	let session = await auth.api.getSession({ headers: request.headers });

	if (!session) {
		throw redirect("/sign-in");
	}

	// Auto-activate personal organization if needed
	session = await ensureActiveOrganization(context.cloudflare.env, session);

	return session;
}

export async function requireAdmin(context: AppLoadContext, request: Request) {
	const { user } = await requireAuth(context, request);

	const adminEmails = context.cloudflare.env.ADMIN_EMAILS
		? context.cloudflare.env.ADMIN_EMAILS.split(",").map((e) => e.trim())
		: [DEFAULT_ADMIN];

	if (!adminEmails.includes(user.email)) {
		throw redirect("/");
	}
	return user;
}

/**
 * Require authentication and return active group ID from session.
 * Redirects to group selection if no active group is set.
 */
export async function requireActiveGroup(
	context: AppLoadContext,
	request: Request,
) {
	const session = await requireAuth(context, request);
	const groupId = session.session.activeOrganizationId;

	if (!groupId) {
		throw redirect("/select-group");
	}

	return { session, groupId };
}
