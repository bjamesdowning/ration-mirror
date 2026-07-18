/**
 * Detect bot-wall / access-support pages returned by recipe sites
 * (e.g. Dotdash Meredith / People Inc. allrecipes.com HTTP 402 pages).
 */

export const SITE_BLOCKED_CODE = "SITE_BLOCKED" as const;

export const SITE_BLOCKED_MESSAGE =
	"This site blocked automated import. On the app we'll try loading it on your device; on web, paste the page HTML, or add the recipe manually.";

/** HTTP statuses that indicate the origin refused automated access. */
export const SITE_BLOCK_HTTP_STATUSES = new Set([402, 403, 429]);

const ACCESS_PAGE_PATTERNS: RegExp[] = [
	/access\s+issue/i,
	/support@people\.inc/i,
	/contentlicensing@people\.inc/i,
	/attention\s+required/i,
	/just\s+a\s+moment/i,
	/cf-browser-verification/i,
	/enable\s+javascript\s+and\s+cookies/i,
	/checking\s+your\s+browser/i,
	/sorry,\s+you\s+have\s+been\s+blocked/i,
	/access\s+denied/i,
	/robot\s+or\s+automated\s+request/i,
];

const AI_ACCESS_MESSAGE_PATTERNS: RegExp[] = [
	/access\s+issue/i,
	/support\s+page/i,
	/access\s+(denied|blocked|wall)/i,
	/\b(bot|automated)\s+(protection|block|wall)/i,
	/captcha/i,
	/challenge\s+page/i,
	/checking\s+your\s+browser/i,
];

/**
 * Returns true when the HTML/markdown body looks like a bot-wall or
 * publisher access-support page rather than a recipe.
 */
export function isBlockedPageContent(text: string): boolean {
	const sample = text.slice(0, 8_000);
	return ACCESS_PAGE_PATTERNS.some((re) => re.test(sample));
}

/**
 * Map AI NOT_A_RECIPE messages that describe access/support walls to SITE_BLOCKED.
 */
export function isAccessWallAiMessage(message: string): boolean {
	return AI_ACCESS_MESSAGE_PATTERNS.some((re) => re.test(message));
}

export function isSiteBlockHttpStatus(status: number): boolean {
	return SITE_BLOCK_HTTP_STATUSES.has(status);
}

export const IMPORT_PAGE_R2_PREFIX = "import-page/";

export function importPageR2Key(requestId: string): string {
	return `${IMPORT_PAGE_R2_PREFIX}${requestId}`;
}

/** UTF-8 byte length of a string (Workers / browser). */
export function utf8ByteLength(text: string): number {
	return new TextEncoder().encode(text).byteLength;
}
