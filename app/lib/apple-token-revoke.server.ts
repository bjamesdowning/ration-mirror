import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { generateAppleClientSecret } from "~/lib/apple-web-login.server";
import { log, redactId } from "~/lib/logging.server";

const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";

export type AppleRevokeTokenHint = "refresh_token" | "access_token";

export function pickAppleRevokeCredential(account: {
	refreshToken?: string | null;
	accessToken?: string | null;
}): { token: string; tokenTypeHint: AppleRevokeTokenHint } | null {
	const refresh = account.refreshToken?.trim();
	if (refresh) {
		return { token: refresh, tokenTypeHint: "refresh_token" };
	}
	const access = account.accessToken?.trim();
	if (access) {
		return { token: access, tokenTypeHint: "access_token" };
	}
	return null;
}

function appleClientIds(env: Cloudflare.Env): string[] {
	const ids: string[] = [];
	const bundle = env.APPLE_APP_BUNDLE_IDENTIFIER?.trim();
	const services = env.APPLE_SERVICES_ID?.trim();
	if (bundle) ids.push(bundle);
	if (services && services !== bundle) ids.push(services);
	return ids;
}

function hasAppleRevokeSecrets(env: Cloudflare.Env): boolean {
	return Boolean(
		env.APPLE_TEAM_ID?.trim() &&
			env.APPLE_KEY_ID?.trim() &&
			env.APPLE_PRIVATE_KEY?.trim() &&
			appleClientIds(env).length > 0,
	);
}

/**
 * POST appleid.apple.com/auth/revoke — returns true on HTTP 200.
 * Exported for unit tests with a custom fetch.
 */
export async function postAppleTokenRevoke(params: {
	clientId: string;
	clientSecret: string;
	token: string;
	tokenTypeHint: AppleRevokeTokenHint;
	fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; status: number }> {
	const fetchImpl = params.fetchImpl ?? fetch;
	const body = new URLSearchParams({
		client_id: params.clientId,
		client_secret: params.clientSecret,
		token: params.token,
		token_type_hint: params.tokenTypeHint,
	});
	const response = await fetchImpl(APPLE_REVOKE_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});
	return { ok: response.ok, status: response.status };
}

/**
 * Best-effort Sign in with Apple token revoke before account purge (TN3194 / 5.1.1(v)).
 * Continues without throwing when tokens or Apple secrets are missing — deletion must still succeed.
 */
export async function revokeAppleTokensForUser(
	env: Cloudflare.Env,
	userId: string,
	options?: { fetchImpl?: typeof fetch },
): Promise<void> {
	if (!hasAppleRevokeSecrets(env)) {
		log.info(
			"[Purge] Skipping Apple token revoke — Apple key secrets not configured",
			{
				userId: redactId(userId),
			},
		);
		return;
	}

	const db = drizzle(env.DB, { schema });
	const appleAccount = await db.query.account.findFirst({
		where: and(
			eq(schema.account.userId, userId),
			eq(schema.account.providerId, "apple"),
		),
		columns: {
			refreshToken: true,
			accessToken: true,
		},
	});

	if (!appleAccount) {
		return;
	}

	const credential = pickAppleRevokeCredential(appleAccount);
	if (!credential) {
		log.info(
			"[Purge] Apple account has no refresh/access token to revoke — continuing delete",
			{ userId: redactId(userId) },
		);
		return;
	}

	const teamId = env.APPLE_TEAM_ID?.trim();
	const keyId = env.APPLE_KEY_ID?.trim();
	const privateKey = env.APPLE_PRIVATE_KEY;
	const clientIds = appleClientIds(env);
	if (!teamId || !keyId || !privateKey || clientIds.length === 0) {
		return;
	}

	for (const clientId of clientIds) {
		try {
			const clientSecret = await generateAppleClientSecret(
				clientId,
				teamId,
				keyId,
				privateKey,
			);
			const result = await postAppleTokenRevoke({
				clientId,
				clientSecret,
				token: credential.token,
				tokenTypeHint: credential.tokenTypeHint,
				fetchImpl: options?.fetchImpl,
			});
			if (result.ok) {
				log.info("[Purge] Revoked Apple Sign in token", {
					userId: redactId(userId),
					tokenTypeHint: credential.tokenTypeHint,
				});
				return;
			}
			log.info("[Purge] Apple token revoke returned non-OK status", {
				userId: redactId(userId),
				status: result.status,
			});
		} catch (error) {
			log.error("[Purge] Apple token revoke failed (best-effort)", error, {
				userId: redactId(userId),
			});
		}
	}
}
