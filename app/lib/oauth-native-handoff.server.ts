import {
	classifyOAuthClientRedirect,
	getSafeAuthRedirectUrl,
	isLocalhostHttpMcpClientRedirectUrl,
	isNativeMcpClientRedirectUrl,
} from "./oauth-redirect.server";

/** Base64url-encode a client callback for the handoff page query param. */
export function encodeNativeCallbackTarget(url: string): string {
	const bytes = new TextEncoder().encode(url);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

export function decodeNativeCallbackTarget(encoded: string): string | null {
	try {
		const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
		const padLen = (4 - (padded.length % 4)) % 4;
		const base64 = padded + "=".repeat(padLen);
		const binary = atob(base64);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

export function buildNativeCallbackHandoffPath(nativeUrl: string): string {
	return `/oauth/return?to=${encodeNativeCallbackTarget(nativeUrl)}`;
}

/**
 * Cursor's hosted MCP OAuth callback. www.cursor.com 308s to the apex host,
 * so both origins are listed. Path is exact. A non-empty `code` is required.
 * Any other https URL stays out so /oauth/return is not an open redirect.
 */
const CURSOR_HOSTED_OAUTH_CALLBACKS = [
	{
		protocol: "https:",
		hostname: "www.cursor.com",
		pathname: "/agents/mcp/oauth/callback",
	},
	{
		protocol: "https:",
		hostname: "cursor.com",
		pathname: "/agents/mcp/oauth/callback",
	},
] as const;

export function isCursorHostedMcpCallbackUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.username !== "" || parsed.password !== "") {
		return false;
	}
	const hostMatches = CURSOR_HOSTED_OAUTH_CALLBACKS.some(
		(allowed) =>
			parsed.protocol === allowed.protocol &&
			parsed.hostname === allowed.hostname &&
			parsed.port === "" &&
			parsed.pathname === allowed.pathname,
	);
	if (!hostMatches) {
		return false;
	}
	const code = parsed.searchParams.get("code");
	return typeof code === "string" && code.trim().length > 0;
}

/** Native schemes, http localhost, and Cursor's hosted HTTPS callbacks need /oauth/return to bypass CSP form-action. */
export function shouldUseClientCallbackHandoff(url: string): boolean {
	return (
		isNativeMcpClientRedirectUrl(url) ||
		isLocalhostHttpMcpClientRedirectUrl(url) ||
		isCursorHostedMcpCallbackUrl(url)
	);
}

export function validateClientCallbackHandoffTarget(
	target: string | null,
): string | null {
	if (!target || !shouldUseClientCallbackHandoff(target)) {
		return null;
	}
	if (!getSafeAuthRedirectUrl({ redirect: true, url: target })) {
		return null;
	}
	if (classifyOAuthClientRedirect(target).kind !== "code") {
		return null;
	}
	return target;
}

/** @deprecated Use validateClientCallbackHandoffTarget */
export const validateNativeCallbackHandoffTarget =
	validateClientCallbackHandoffTarget;

export function buildNativeCallbackHandoffHtml(targetUrl: string): string {
	const escaped = targetUrl
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;");
	const jsEscaped = JSON.stringify(targetUrl);
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0;url=${escaped}" />
  <title>Returning to your app</title>
  <style>
    body { font-family: ui-monospace, monospace; background: #f8f9fa; color: #111; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
    main { max-width: 28rem; padding: 2rem; border-radius: 1rem; background: rgba(255,255,255,0.72); border: 1px solid #e6e6e6; text-align: center; }
    a { color: #00e088; font-weight: 700; }
  </style>
  <script>window.location.replace(${jsEscaped});</script>
</head>
<body>
  <main>
    <p>Authorization complete. Returning to your app…</p>
    <p><a href="${escaped}">Tap here</a> if you are not redirected automatically.</p>
  </main>
</body>
</html>`;
}
