import type { CopilotIdentity } from "./auth.server";

const WEB_SESSION_TOKEN_PREFIX = "copilot:web-session";
const WEB_SESSION_TOKEN_TTL_SECONDS = 60;

export type CopilotWebSessionIdentity = CopilotIdentity & {
	expiresAt: string;
};

function tokenKey(token: string): string {
	return `${WEB_SESSION_TOKEN_PREFIX}:${token}`;
}

function isValidToken(token: string): boolean {
	return /^[A-Za-z0-9_-]{32,96}$/.test(token);
}

function createToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

export async function createCopilotWebSessionToken(
	env: Pick<Env, "RATION_KV">,
	identity: Omit<CopilotIdentity, "source">,
): Promise<{ token: string; expiresAt: string }> {
	const token = createToken();
	const expiresAt = new Date(
		Date.now() + WEB_SESSION_TOKEN_TTL_SECONDS * 1000,
	).toISOString();
	const payload: CopilotWebSessionIdentity = {
		...identity,
		source: "web",
		expiresAt,
	};

	await env.RATION_KV.put(tokenKey(token), JSON.stringify(payload), {
		expirationTtl: WEB_SESSION_TOKEN_TTL_SECONDS,
	});
	return { token, expiresAt };
}

export async function consumeCopilotWebSessionToken(
	env: Pick<Env, "RATION_KV">,
	token: string,
): Promise<CopilotIdentity | null> {
	if (!isValidToken(token)) return null;
	const key = tokenKey(token);
	const payload = await env.RATION_KV.get<CopilotWebSessionIdentity>(
		key,
		"json",
	);
	await env.RATION_KV.delete(key);

	if (!payload || new Date(payload.expiresAt).getTime() <= Date.now()) {
		return null;
	}

	return {
		userId: payload.userId,
		organizationId: payload.organizationId,
		tier: payload.tier,
		source: "web",
	};
}
