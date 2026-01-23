import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import type { AppLoadContext } from "react-router";
import { redirect } from "react-router";
import * as schema from "../db/schema";

const DEFAULT_ADMIN = "admin@ration.com";

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
				clientId: (env as any).GOOGLE_CLIENT_ID as string,
				clientSecret: (env as any).GOOGLE_CLIENT_SECRET as string,
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
	});
}

export type Auth = ReturnType<typeof createAuth>;

export async function requireAuth(context: AppLoadContext, request: Request) {
	const auth = createAuth(context.cloudflare.env);
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		throw redirect("/sign-in");
	}
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
