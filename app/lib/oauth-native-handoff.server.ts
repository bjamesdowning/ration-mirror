import {
	classifyOAuthClientRedirect,
	getSafeAuthRedirectUrl,
	isNativeMcpClientRedirectUrl,
} from "./oauth-redirect.server";

/** Base64url-encode a native client callback for the handoff page query param. */
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

export function validateNativeCallbackHandoffTarget(
	target: string | null,
): string | null {
	if (!target || !isNativeMcpClientRedirectUrl(target)) {
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
