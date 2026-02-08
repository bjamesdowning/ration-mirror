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
import { redactId } from "./logging.server";

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

	// Dev Mode Detection: Enable credential provider if Google OAuth is not configured
	const authEnv = env as Cloudflare.Env & {
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
	};
	const isDevMode =
		!authEnv.GOOGLE_CLIENT_ID || authEnv.GOOGLE_CLIENT_ID.trim() === "";

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: {
				user: schema.user,
				session: schema.session,
				account: schema.account,
				verification: schema.verification,
				organization: schema.organization,
				member: schema.member,
				invitation: schema.invitation,
			},
		}),
		user: {
			additionalFields: {
				settings: {
					type: "string", // JSON stored as text in D1
					required: false,
					returned: true, // Include in getSession() response
					input: false, // Don't allow setting via auth API
				},
				isAdmin: {
					type: "boolean",
					required: false,
					returned: true,
					input: false,
				},
			},
		},
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
		socialProviders: isDevMode
			? {}
			: {
					google: {
						clientId: (env as Cloudflare.Env & { GOOGLE_CLIENT_ID: string })
							.GOOGLE_CLIENT_ID,
						clientSecret: (
							env as Cloudflare.Env & { GOOGLE_CLIENT_SECRET: string }
						).GOOGLE_CLIENT_SECRET,
					},
				},
		...(isDevMode && {
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: false,
			},
		}),
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
								`[Auth] Created personal group ${redactId(personalOrgId)} for user ${redactId(user.id)}`,
							);
						} catch (error) {
							console.error(
								`[Auth] Failed to create personal group for user ${redactId(user.id)}:`,
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
 * Also syncs theme cookie if missing (e.g., new browser login).
 * Should be called in loaders/actions after getting session.
 */
export async function ensureActiveOrganization(
	env: Cloudflare.Env,
	session: NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>,
	request?: Request,
): Promise<{
	session: NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
	headers?: Headers;
}> {
	const db = drizzle(env.DB, { schema });
	let syncHeaders: Headers | undefined;

	// Sync theme cookie if missing (new browser login)
	if (request) {
		const cookieHeader = request.headers.get("Cookie") || "";
		const hasThemeCookie = /theme=(light|dark)/.test(cookieHeader);

		if (!hasThemeCookie) {
			const user = await db.query.user.findFirst({
				where: eq(schema.user.id, session.user.id),
			});
			const theme =
				(user?.settings as { theme?: "light" | "dark" })?.theme || "light";
			const secureFlag = request.url.startsWith("https://") ? "; Secure" : "";
			syncHeaders = new Headers();
			syncHeaders.set(
				"Set-Cookie",
				`theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secureFlag}`,
			);
		}
	}

	if (session.session.activeOrganizationId) {
		return { session, headers: syncHeaders }; // Already has active org
	}

	try {
		// Check if user has a default group preference
		const user = await db.query.user.findFirst({
			where: eq(schema.user.id, session.user.id),
		});

		const userSettings = (user?.settings as { defaultGroupId?: string }) || {};
		const defaultGroupId = userSettings.defaultGroupId;

		// If user has a default group preference, verify they're still a member
		if (defaultGroupId) {
			const membership = await db.query.member.findFirst({
				where: (member, { and, eq }) =>
					and(
						eq(member.organizationId, defaultGroupId),
						eq(member.userId, session.user.id),
					),
			});

			if (membership) {
				// User is still a member, use their default group
				await db
					.update(schema.session)
					.set({ activeOrganizationId: defaultGroupId })
					.where(eq(schema.session.id, session.session.id));

				console.log(
					`[Auth] Auto-activated default group ${redactId(defaultGroupId)} for session ${redactId(session.session.id)}`,
				);

				return {
					session: {
						...session,
						session: {
							...session.session,
							activeOrganizationId: defaultGroupId,
						},
					},
					headers: syncHeaders,
				};
			}
			console.log(
				`[Auth] User default group ${redactId(defaultGroupId)} no longer accessible, falling back to personal group`,
			);
		}

		// Fallback: Find user's personal group
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
				`[Auth] Auto-activated personal group ${redactId(personalGroup.id)} for session ${redactId(session.session.id)}`,
			);

			// Return updated session
			return {
				session: {
					...session,
					session: {
						...session.session,
						activeOrganizationId: personalGroup.id,
					},
				},
				headers: syncHeaders,
			};
		}
	} catch (error) {
		console.error("[Auth] Failed to auto-activate organization:", error);
	}

	return { session, headers: syncHeaders };
}

export async function requireAuth(context: AppLoadContext, request: Request) {
	const auth = createAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session) {
		throw redirect("/");
	}

	// Auto-activate personal organization if needed and sync theme cookie
	const { session: updatedSession } = await ensureActiveOrganization(
		context.cloudflare.env,
		session,
		request,
	);

	return updatedSession;
}

export async function requireAdmin(context: AppLoadContext, request: Request) {
	const session = await requireAuth(context, request);

	if (session.user.isAdmin) {
		return session.user;
	}

	const db = drizzle(context.cloudflare.env.DB, { schema });
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, session.user.id),
		columns: {
			isAdmin: true,
		},
	});

	if (!user?.isAdmin) {
		throw redirect("/");
	}

	return { ...session.user, isAdmin: true };
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
