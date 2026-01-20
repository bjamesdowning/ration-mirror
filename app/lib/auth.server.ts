// @ts-nocheck
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
// @ts-expect-error
import { redirect } from "react-router";
import * as schema from "../db/schema";

const ADMIN_EMAIL = "admin@ration.com";

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
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
	});
}

export type Auth = ReturnType<typeof createAuth>;

export async function requireAuth(
	context: { cloudflare: { env: Cloudflare.Env } },
	request: Request,
) {
	const auth = createAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		throw redirect("/sign-in");
	}
	return session;
}

export async function requireAdmin(
	context: { cloudflare: { env: Cloudflare.Env } },
	request: Request,
) {
	const { user } = await requireAuth(context, request);
	if (user.email !== ADMIN_EMAIL) {
		throw redirect("/");
	}
	return user;
}
