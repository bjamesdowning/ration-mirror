const JWT_HEADER = { alg: "HS256", typ: "JWT" } as const;

function base64UrlEncodeBytes(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) {
		binary += String.fromCharCode(b);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function base64UrlEncodeJson(obj: object): string {
	return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(obj)));
}

/** Typed allowlist for attributes that may be signed into the Intercom JWT. */
export type SignedIntercomAttributes = {
	/** DB-native tier value: "free" | "crew_member" (effective — expired crew projects as "free"). */
	tier?: string;
	/** Unix seconds when the crew tier expires; null/omitted for free users. */
	tier_expires_at?: number;
	/** True when the user's crew_member tier has lapsed past tierExpiresAt. */
	tier_expired?: boolean;
	/** Stripe customer ID; omitted when the user has never purchased. */
	stripe_customer_id?: string;
	/** True when the current subscription is scheduled to cancel at period end. */
	subscription_cancel_at_period_end?: boolean;
	/** Unix seconds of the user's first crew subscription; omitted for free users. */
	crew_subscribed_at?: number;
	/** True once the WELCOME65 voucher has been redeemed by this user. */
	welcome_voucher_redeemed?: boolean;
	/** True for internal admin accounts — lets Fin adjust tone/guardrails. */
	is_admin?: boolean;
	/** Role in the active org: "owner" | "admin" | "member". */
	org_role?: string;
	/** AI credit balance for the active organization (integer). */
	credit_balance?: number;
	/** TOS version accepted by the user, e.g. "2026-03-11". */
	tos_version?: string;
	/** UI theme preference: "light" | "dark". */
	theme?: string;
};

/** Max length for any string attribute value — prevents bloated JWT payloads. */
const STRING_ATTR_MAX_LEN = 128;

function sanitizeAttrValue(
	value: string | number | boolean | undefined,
): string | number | boolean | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed === "" || trimmed.length > STRING_ATTR_MAX_LEN)
			return undefined;
		return trimmed;
	}
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : undefined;
	}
	return value; // boolean
}

const ALLOWED_ATTRIBUTE_KEYS = new Set<keyof SignedIntercomAttributes>([
	"tier",
	"tier_expires_at",
	"tier_expired",
	"stripe_customer_id",
	"subscription_cancel_at_period_end",
	"crew_subscribed_at",
	"welcome_voucher_redeemed",
	"is_admin",
	"org_role",
	"credit_balance",
	"tos_version",
	"theme",
]);

export type SignIntercomJwtOptions = {
	userId: string;
	email: string;
	companyId?: string | null;
	secret: string;
	attributes?: SignedIntercomAttributes;
	/** For tests — Unix seconds used as "now" when computing `iat` and `exp`. */
	nowSeconds?: number;
};

/**
 * HS256 JWT for Intercom Messenger Security (`intercom_user_jwt`).
 * Signed attributes in the payload are trusted by Intercom/Fin over any
 * unsigned JS boot attributes.
 * @see https://www.intercom.com/help/en/articles/10589769-authenticating-users-in-the-messenger-with-json-web-tokens-jwts
 */
export async function signIntercomJwt(
	options: SignIntercomJwtOptions,
): Promise<string | null> {
	const { userId, email, companyId, secret, attributes, nowSeconds } = options;

	const uid = userId.trim();
	const sec = secret.trim();
	if (!uid || !sec) {
		return null;
	}

	const now = nowSeconds ?? Math.floor(Date.now() / 1000);
	const payload: Record<string, string | number | boolean> = {
		user_id: uid,
		iat: now,
		exp: now + 300,
	};

	const trimmedEmail = email.trim();
	if (trimmedEmail !== "") {
		payload.email = trimmedEmail;
	}

	const trimmedCompany = companyId?.trim();
	if (trimmedCompany) {
		payload.company_id = trimmedCompany;
	}

	if (attributes) {
		for (const key of ALLOWED_ATTRIBUTE_KEYS) {
			const raw = attributes[key];
			const sanitized = sanitizeAttrValue(
				raw as string | number | boolean | undefined,
			);
			if (sanitized !== undefined) {
				payload[key] = sanitized;
			}
		}
	}

	const headerPart = base64UrlEncodeJson(JWT_HEADER);
	const payloadPart = base64UrlEncodeJson(payload);
	const signingInput = `${headerPart}.${payloadPart}`;

	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(sec),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
	const sigPart = base64UrlEncodeBytes(new Uint8Array(sig));

	return `${signingInput}.${sigPart}`;
}
