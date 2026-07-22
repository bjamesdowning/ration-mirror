import { data } from "react-router";
import {
	buildSignupIntentCookie,
	clearSignupIntentForEmail,
	putSignupIntentForEmail,
	putSignupIntentToken,
} from "~/lib/tos-signup-intent.server";

const SIGN_IN_SOCIAL_SUFFIX = "/sign-in/social";
const SIGN_IN_MAGIC_LINK_SUFFIX = "/sign-in/magic-link";

type SocialWebAuthRequest =
	| { kind: "none" }
	| {
			kind: "social";
			provider: string;
			isSignUp: boolean;
			tosAccepted: boolean;
	  }
	| {
			kind: "magicLink";
			email: string;
			isSignUp: boolean;
			tosAccepted: boolean;
	  };

async function readAuthSignupRequest(
	request: Request,
): Promise<SocialWebAuthRequest> {
	if (request.method !== "POST") return { kind: "none" };
	const url = new URL(request.url);
	const path = url.pathname;

	try {
		const body = (await request.clone().json()) as {
			provider?: string;
			email?: string;
			requestSignUp?: boolean;
			additionalData?: { tosAccepted?: boolean };
			metadata?: { requestSignUp?: boolean; tosAccepted?: boolean };
		};

		if (path.endsWith(SIGN_IN_SOCIAL_SUFFIX)) {
			const provider =
				typeof body.provider === "string" ? body.provider : "unknown";
			return {
				kind: "social",
				provider,
				isSignUp: body.requestSignUp === true,
				tosAccepted: body.additionalData?.tosAccepted === true,
			};
		}

		if (path.endsWith(SIGN_IN_MAGIC_LINK_SUFFIX)) {
			const email = typeof body.email === "string" ? body.email : "";
			return {
				kind: "magicLink",
				email,
				isSignUp: body.metadata?.requestSignUp === true,
				tosAccepted: body.metadata?.tosAccepted === true,
			};
		}
	} catch {
		return { kind: "none" };
	}

	return { kind: "none" };
}

export type SignupIntentCookieResult = {
	/** Set-Cookie value to attach to the Better Auth response, if any. */
	setCookie: string | null;
};

/**
 * Validates ToS on web Sign Up and stores a short-lived signup intent
 * (email-keyed for magic link, cookie token for OAuth).
 */
export async function prepareWebSignupIntent(
	env: Cloudflare.Env,
	request: Request,
): Promise<SignupIntentCookieResult> {
	const authRequest = await readAuthSignupRequest(request);
	if (authRequest.kind === "none") {
		return { setCookie: null };
	}

	if (!authRequest.isSignUp) {
		// Sign In must not inherit a previously planted Sign Up intent for this email.
		if (authRequest.kind === "magicLink" && authRequest.email.includes("@")) {
			await clearSignupIntentForEmail(env.RATION_KV, authRequest.email);
		}
		return { setCookie: null };
	}

	if (!authRequest.tosAccepted) {
		throw data({ error: "tos_required" }, { status: 403 });
	}

	if (authRequest.kind === "magicLink") {
		if (!authRequest.email.includes("@")) {
			throw data({ error: "invalid_email" }, { status: 400 });
		}
		await putSignupIntentForEmail(env.RATION_KV, authRequest.email);
		return { setCookie: null };
	}

	// Social OAuth: email unknown until callback — use HttpOnly cookie token.
	const token = await putSignupIntentToken(env.RATION_KV);
	const isLocalhost = env.BETTER_AUTH_URL.includes("localhost");
	return {
		setCookie: buildSignupIntentCookie(token, { secure: !isLocalhost }),
	};
}

export function withSignupIntentCookie(
	response: Response,
	setCookie: string | null,
): Response {
	if (!setCookie) return response;
	const headers = new Headers(response.headers);
	headers.append("Set-Cookie", setCookie);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
