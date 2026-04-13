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

export type SignIntercomJwtOptions = {
	/** For tests — Unix seconds used as "now" when computing `exp` */
	nowSeconds?: number;
};

/**
 * HS256 JWT for Intercom Messenger Security (`intercom_user_jwt`).
 * @see https://www.intercom.com/help/en/articles/10589769-authenticating-users-in-the-messenger-with-json-web-tokens-jwts
 */
export async function signIntercomJwt(
	userId: string,
	email: string,
	companyId: string | null,
	secret: string,
	options?: SignIntercomJwtOptions,
): Promise<string | null> {
	const uid = userId.trim();
	const sec = secret.trim();
	if (!uid || !sec) {
		return null;
	}

	const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
	const payload: Record<string, string | number> = {
		user_id: uid,
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
