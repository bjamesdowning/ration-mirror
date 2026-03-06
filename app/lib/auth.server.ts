import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization } from "better-auth/plugins";
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
import { buildMagicLinkEmail, sendEmail } from "./email.server";
import { log, redactId } from "./logging.server";
import type { UserSettings } from "./types";

const statement = {
	...defaultStatements,
	data: ["read", "write"],
	credits: ["purchase"],
} as const;

const ac = createAccessControl(statement);

const owner = ac.newRole({
	...ownerAc.statements,
	data: ["read", "write"],
	credits: ["purchase"],
});

const admin = ac.newRole({
	...adminAc.statements,
	data: ["read", "write"],
	credits: ["purchase"],
});

const member = ac.newRole({
	...memberAc.statements,
	data: ["read", "write"],
});

export function createAuth(env: Cloudflare.Env) {
	const db = drizzle(env.DB, { schema });

	const authEnv = env as Cloudflare.Env & {
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
		RESEND_API_KEY?: string;
	};

	// Google OAuth is optional — falls back to magic-link-only when not configured
	const hasGoogleOAuth =
		!!authEnv.GOOGLE_CLIENT_ID && authEnv.GOOGLE_CLIENT_ID.trim() !== "";

	// Dev-only: enable email/password for Dev Login (dev@ration.app / ration-dev).
	// Only when BETTER_AUTH_URL is localhost — never in production.
	const isDev = env.BETTER_AUTH_URL.includes("localhost");

	return betterAuth({
		...(isDev && {
			emailAndPassword: { enabled: true },
		}),
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
				tier: {
					type: "string",
					required: false,
					returned: true,
					input: false,
				},
				tierExpiresAt: {
					type: "number",
					required: false,
					returned: true,
					input: false,
				},
				welcomeVoucherRedeemed: {
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
			magicLink({
				// Token stored hashed at rest — prevents exposure if DB is compromised
				storeToken: "hashed",
				// 5-minute expiry; single-use (allowedAttempts defaults to 1)
				expiresIn: 300,
				disableSignUp: false, // Auto-register new users
				sendMagicLink: async ({ email, url }) => {
					const resendApiKey = authEnv.RESEND_API_KEY;
					if (!resendApiKey) {
						// In local dev without RESEND_API_KEY: skip sending. No log of URL/token
						// (avoids PII/sensitive token exposure per security directive).
						return;
					}
					const { html, text } = buildMagicLinkEmail(url);
					// Fire-and-forget: do NOT await — prevents timing attacks that
					// reveal whether an email address is registered.
					sendEmail(resendApiKey, {
						to: email,
						subject: "Your Ration sign-in link",
						html,
						text,
					}).catch((err) => {
						log.error("[Auth] Failed to send magic link email", {
							message: err instanceof Error ? err.message : String(err),
						});
					});
				},
			}),
		],
		socialProviders: hasGoogleOAuth
			? {
					google: {
						clientId: (env as Cloudflare.Env & { GOOGLE_CLIENT_ID: string })
							.GOOGLE_CLIENT_ID,
						clientSecret: (
							env as Cloudflare.Env & { GOOGLE_CLIENT_SECRET: string }
						).GOOGLE_CLIENT_SECRET,
					},
				}
			: {},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						try {
							const db = drizzle(env.DB, { schema });

							const personalOrgId = crypto.randomUUID();
							await db.insert(schema.organization).values({
								id: personalOrgId,
								name: `${user.name || "My"}'s Personal Group`,
								slug: `personal-${user.id}`,
								metadata: { isPersonal: true },
								credits: 0,
								createdAt: new Date(),
							});

							await db.insert(schema.member).values({
								id: crypto.randomUUID(),
								organizationId: personalOrgId,
								userId: user.id,
								role: "owner",
								createdAt: new Date(),
							});

							log.info("[Auth] Created personal group", {
								orgId: redactId(personalOrgId),
								userId: redactId(user.id),
							});
						} catch (error) {
							log.error("[Auth] Failed to create personal group", error, {
								userId: redactId(user.id),
							});
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
 * Module-level auth instance cache, keyed on BETTER_AUTH_SECRET.
 *
 * Cloudflare Workers V8 isolates share module-level state across all requests
 * handled within the same isolate lifetime. Constructing a new `betterAuth`
 * instance on every request is wasteful: it re-instantiates the Drizzle adapter,
 * re-registers all plugin hook handlers, and re-builds the internal middleware
 * chain. By caching the instance here, that work is done exactly once.
 *
 * The Map is keyed on BETTER_AUTH_SECRET rather than using a plain singleton
 * variable so that local Wrangler dev (where different env objects may coexist
 * within the same Node.js process) cannot accidentally share an auth instance
 * across environments.
 *
 * Safety: isolates are recycled on every deploy, so there is no risk of a
 * stale-config instance surviving an environment change in production.
 */
const authCache = new Map<string, Auth>();

/**
 * Returns a cached Better Auth instance for the given environment.
 * Creates and caches the instance on first call within an isolate lifetime.
 */
export function getAuth(env: Cloudflare.Env): Auth {
	// Fall back to a dev-mode sentinel key when no secret is configured.
	// This is safe: if the secret changes, the cache key changes and a fresh
	// instance is created.
	const cacheKey = env.BETTER_AUTH_SECRET ?? "__dev__";
	const cached = authCache.get(cacheKey);
	if (cached) return cached;
	const instance = createAuth(env);
	authCache.set(cacheKey, instance);
	return instance;
}

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
		return { session, headers: syncHeaders };
	}

	try {
		const user = await db.query.user.findFirst({
			where: eq(schema.user.id, session.user.id),
		});

		const userSettings = (user?.settings as { defaultGroupId?: string }) || {};
		const defaultGroupId = userSettings.defaultGroupId;

		if (defaultGroupId) {
			const membership = await db.query.member.findFirst({
				where: (member, { and, eq }) =>
					and(
						eq(member.organizationId, defaultGroupId),
						eq(member.userId, session.user.id),
					),
			});

			if (membership) {
				await db
					.update(schema.session)
					.set({ activeOrganizationId: defaultGroupId })
					.where(eq(schema.session.id, session.session.id));

				log.info("[Auth] Auto-activated default group", {
					groupId: redactId(defaultGroupId),
					sessionId: redactId(session.session.id),
				});

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
			log.info("[Auth] User default group no longer accessible", {
				groupId: redactId(defaultGroupId),
			});
		}

		// Fallback: Find user's personal group
		const personalGroup = await db.query.organization.findFirst({
			where: like(schema.organization.slug, `personal-${session.user.id}`),
		});

		if (personalGroup) {
			await db
				.update(schema.session)
				.set({ activeOrganizationId: personalGroup.id })
				.where(eq(schema.session.id, session.session.id));

			log.info("[Auth] Auto-activated personal group", {
				orgId: redactId(personalGroup.id),
				sessionId: redactId(session.session.id),
			});

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
		log.error("[Auth] Failed to auto-activate organization", error);
	}

	return { session, headers: syncHeaders };
}

export async function requireAuth(context: AppLoadContext, request: Request) {
	const auth = getAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session) {
		throw redirect("/");
	}

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

/**
 * Read the UserSettings JSON blob for a single user.
 * Returns an empty object when the user has no settings saved yet.
 */
export async function getUserSettings(
	db: D1Database,
	userId: string,
): Promise<UserSettings> {
	const drizzleDb = drizzle(db, { schema });
	const row = await drizzleDb.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: { settings: true },
	});
	return (row?.settings as UserSettings) ?? {};
}

/**
 * Merge a partial settings patch into the user's existing settings and persist.
 * Uses a read-then-write pattern; keys not present in `patch` are preserved.
 */
export async function patchUserSettings(
	db: D1Database,
	userId: string,
	patch: Partial<UserSettings>,
): Promise<void> {
	const drizzleDb = drizzle(db, { schema });
	const row = await drizzleDb.query.user.findFirst({
		where: eq(schema.user.id, userId),
		columns: { settings: true },
	});
	const current = (row?.settings as UserSettings) ?? {};
	await drizzleDb
		.update(schema.user)
		.set({ settings: { ...current, ...patch } })
		.where(eq(schema.user.id, userId));
}

/**
 * Persist a fully-composed UserSettings object without a prior read.
 * Use when the caller has already fetched and merged the settings (avoids
 * the redundant read that `patchUserSettings` would perform).
 */
export async function writeUserSettings(
	db: D1Database,
	userId: string,
	settings: UserSettings,
): Promise<void> {
	const drizzleDb = drizzle(db, { schema });
	await drizzleDb
		.update(schema.user)
		.set({ settings })
		.where(eq(schema.user.id, userId));
}
