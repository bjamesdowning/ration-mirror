import { importPKCS8, SignJWT } from "jose";
import { data } from "react-router";
import {
	type FlagshipEvaluationContext,
	isFeatureEnabled,
} from "~/lib/feature-flags/flags.server";

const APPLE_WEB_LOGIN_FLAG = "apple-web-login";
const APPLE_CALLBACK_SUFFIX = "/callback/apple";
const SIGN_IN_SOCIAL_SUFFIX = "/sign-in/social";

/** 180 days — under Apple's six-month client-secret cap. */
const CLIENT_SECRET_TTL_SEC = 180 * 24 * 60 * 60;

function normalizeApplePrivateKey(pem: string): string {
	return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

function isNonEmptySecret(value: string | undefined): value is string {
	return typeof value === "string" && value.trim() !== "";
}

export function hasAppleWebCredentials(env: Cloudflare.Env): boolean {
	return (
		isNonEmptySecret(env.APPLE_SERVICES_ID) &&
		isNonEmptySecret(env.APPLE_TEAM_ID) &&
		isNonEmptySecret(env.APPLE_KEY_ID) &&
		isNonEmptySecret(env.APPLE_PRIVATE_KEY)
	);
}

export function hasAppleNativeCredentials(env: Cloudflare.Env): boolean {
	return isNonEmptySecret(env.APPLE_APP_BUNDLE_IDENTIFIER);
}

export async function generateAppleClientSecret(
	servicesId: string,
	teamId: string,
	keyId: string,
	privateKeyPem: string,
): Promise<string> {
	const key = await importPKCS8(
		normalizeApplePrivateKey(privateKeyPem),
		"ES256",
	);
	const now = Math.floor(Date.now() / 1000);
	return new SignJWT({})
		.setProtectedHeader({ alg: "ES256", kid: keyId })
		.setIssuer(teamId)
		.setSubject(servicesId)
		.setAudience("https://appleid.apple.com")
		.setIssuedAt(now)
		.setExpirationTime(now + CLIENT_SECRET_TTL_SEC)
		.sign(key);
}

type AppleSocialProvider =
	| {
			clientId: string;
			appBundleIdentifier: string;
			disableImplicitSignUp: true;
	  }
	| (() => Promise<{
			clientId: string;
			clientSecret: string;
			audience: string[];
			disableImplicitSignUp: true;
	  }>);

/** Better Auth `socialProviders.apple` — web OAuth when secrets exist, else native-only. */
export function resolveAppleSocialProvider(
	env: Cloudflare.Env,
): AppleSocialProvider | undefined {
	const bundleId = env.APPLE_APP_BUNDLE_IDENTIFIER?.trim() ?? "";
	if (!bundleId && !hasAppleWebCredentials(env)) {
		return undefined;
	}

	if (!hasAppleWebCredentials(env)) {
		if (!bundleId) return undefined;
		return {
			clientId: bundleId,
			appBundleIdentifier: bundleId,
			disableImplicitSignUp: true,
		};
	}

	const servicesId = env.APPLE_SERVICES_ID?.trim() as string;
	const teamId = env.APPLE_TEAM_ID?.trim() as string;
	const keyId = env.APPLE_KEY_ID?.trim() as string;
	const privateKey = env.APPLE_PRIVATE_KEY?.trim() as string;
	const audiences = bundleId ? [servicesId, bundleId] : [servicesId];

	return async () => ({
		clientId: servicesId,
		clientSecret: await generateAppleClientSecret(
			servicesId,
			teamId,
			keyId,
			privateKey,
		),
		audience: audiences,
		disableImplicitSignUp: true,
	});
}

export async function isAppleWebLoginAvailable(
	env: Cloudflare.Env,
	context: FlagshipEvaluationContext,
): Promise<boolean> {
	return (
		hasAppleWebCredentials(env) &&
		(await isFeatureEnabled(env, APPLE_WEB_LOGIN_FLAG, context))
	);
}

type AppleWebAuthRequest =
	| { isApple: false }
	| { isApple: true; isSignUp: boolean; tosAccepted: boolean };

async function readAppleWebAuthRequest(
	request: Request,
): Promise<AppleWebAuthRequest> {
	const url = new URL(request.url);
	if (url.pathname.endsWith(APPLE_CALLBACK_SUFFIX)) {
		return { isApple: true, isSignUp: false, tosAccepted: false };
	}
	if (
		request.method !== "POST" ||
		!url.pathname.endsWith(SIGN_IN_SOCIAL_SUFFIX)
	) {
		return { isApple: false };
	}
	try {
		const body = (await request.clone().json()) as {
			provider?: string;
			requestSignUp?: boolean;
			additionalData?: { tosAccepted?: boolean };
		};
		if (body.provider !== "apple") return { isApple: false };
		return {
			isApple: true,
			isSignUp: body.requestSignUp === true,
			tosAccepted: body.additionalData?.tosAccepted === true,
		};
	} catch {
		return { isApple: false };
	}
}

/** Blocks web Apple OAuth when the feature flag is off or credentials are missing. */
export async function assertAppleWebLoginAllowed(
	env: Cloudflare.Env,
	request: Request,
	context: FlagshipEvaluationContext,
): Promise<void> {
	const appleRequest = await readAppleWebAuthRequest(request);
	if (!appleRequest.isApple) {
		return;
	}
	if (await isAppleWebLoginAvailable(env, context)) {
		if (appleRequest.isSignUp && !appleRequest.tosAccepted) {
			throw data({ error: "tos_required" }, { status: 403 });
		}
		return;
	}
	throw data(null, { status: 404 });
}
