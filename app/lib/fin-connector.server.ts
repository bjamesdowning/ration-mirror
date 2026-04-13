const CONNECTOR_TOKEN_HEADER = "x-intercom-token";

function constantTimeEqual(a: string, b: string): boolean {
	const aBytes = new TextEncoder().encode(a);
	const bBytes = new TextEncoder().encode(b);

	const maxLen = Math.max(aBytes.length, bBytes.length);
	let diff = aBytes.length ^ bBytes.length;
	for (let i = 0; i < maxLen; i++) {
		const av = i < aBytes.length ? aBytes[i] : 0;
		const bv = i < bBytes.length ? bBytes[i] : 0;
		diff |= av ^ bv;
	}

	return diff === 0;
}

export function extractFinConnectorToken(headers: Headers): string | null {
	const auth = headers.get("Authorization");
	if (auth) {
		const trimmed = auth.trim();
		const prefix = "bearer ";
		if (trimmed.toLowerCase().startsWith(prefix)) {
			const token = trimmed.slice(prefix.length).trim();
			if (token.length > 0) return token;
		}
	}

	const custom = headers.get(CONNECTOR_TOKEN_HEADER)?.trim();
	return custom && custom.length > 0 ? custom : null;
}

export function isValidFinConnectorRequest(
	headers: Headers,
	expectedSecret: string | undefined,
): boolean {
	const secret = expectedSecret?.trim();
	if (!secret) return false;
	const token = extractFinConnectorToken(headers);
	if (!token) return false;
	return constantTimeEqual(token, secret);
}

export function parseFinUserId(raw: string | null): string | null {
	if (!raw) return null;
	const userId = raw.trim();
	if (!userId || userId.length > 128) return null;
	// Better Auth IDs in this app are opaque but never include whitespace.
	if (/\s/.test(userId)) return null;
	return userId;
}
