import { requiresOAuthOrgSelection } from "./oauth.server";
import {
	extractSignedOAuthQueryParams,
	parseScopesFromOAuthQuery,
	sanitizeOAuthQueryForBetterAuth,
} from "./oauth-flow";
import {
	OAUTH_FLOW_RECORD_VERSION,
	OAUTH_FLOW_TTL_SEC,
	type OAuthFlowErrorCode,
	type OAuthFlowRecord,
	type OAuthFlowStep,
	oauthFlowRecordSchema,
} from "./schemas/oauth-flow";

const OAUTH_FLOW_KV_PREFIX = "oauth:flow:";

const STEP_ORDER: readonly OAuthFlowStep[] = [
	"initiated",
	"authenticated",
	"org_selected",
	"consent_presented",
	"completed",
];

export class OAuthFlowError extends Error {
	readonly code: OAuthFlowErrorCode;

	constructor(code: OAuthFlowErrorCode, message?: string) {
		super(message ?? code);
		this.name = "OAuthFlowError";
		this.code = code;
	}
}

export function flowKvKey(flowId: string): string {
	return `${OAUTH_FLOW_KV_PREFIX}${flowId}`;
}

/** SHA-256 hex digest of oauth_query for submit validation (not logged). */
export async function digestOAuthQuery(oauthQuery: string): Promise<string> {
	const data = new TextEncoder().encode(oauthQuery);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function verifyOAuthQueryDigestAsync(
	oauthQuery: string,
	expectedDigest: string,
): Promise<boolean> {
	const actual = await digestOAuthQuery(oauthQuery);
	return actual === expectedDigest;
}

function stepRank(step: OAuthFlowStep): number {
	const idx = STEP_ORDER.indexOf(step);
	return idx === -1 ? -1 : idx;
}

export function isStepAtLeast(
	current: OAuthFlowStep,
	required: OAuthFlowStep,
): boolean {
	if (current === "failed" || current === "expired") {
		return false;
	}
	return stepRank(current) >= stepRank(required);
}

function parseClientIdFromOAuthQuery(oauthQuery: string): string {
	const clientId = new URLSearchParams(oauthQuery).get("client_id");
	if (!clientId) {
		throw new OAuthFlowError("missing_oauth_query", "Missing client_id");
	}
	return clientId;
}

export function extractOAuthQueryFromRequest(url: URL): string | null {
	return extractSignedOAuthQueryParams(url.searchParams);
}

export async function createFlow(
	kv: KVNamespace,
	oauthQuery: string,
): Promise<OAuthFlowRecord> {
	const trimmed = sanitizeOAuthQueryForBetterAuth(oauthQuery.trim());
	if (!trimmed) {
		throw new OAuthFlowError("missing_oauth_query");
	}

	const now = Date.now();
	const flowId = crypto.randomUUID();
	const record: OAuthFlowRecord = {
		flowId,
		step: "initiated",
		oauthQueryDigest: await digestOAuthQuery(trimmed),
		clientId: parseClientIdFromOAuthQuery(trimmed),
		requestedScopes: parseScopesFromOAuthQuery(trimmed),
		createdAt: now,
		expiresAt: now + OAUTH_FLOW_TTL_SEC * 1000,
		version: OAUTH_FLOW_RECORD_VERSION,
	};

	const parsed = oauthFlowRecordSchema.parse(record);
	await kv.put(flowKvKey(flowId), JSON.stringify(parsed), {
		expirationTtl: OAUTH_FLOW_TTL_SEC,
	});
	return parsed;
}

export async function getFlow(
	kv: KVNamespace,
	flowId: string,
): Promise<OAuthFlowRecord | null> {
	const raw = await kv.get(flowKvKey(flowId));
	if (!raw) {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	const result = oauthFlowRecordSchema.safeParse(parsed);
	if (!result.success) {
		return null;
	}

	if (result.data.expiresAt < Date.now()) {
		return null;
	}

	return result.data;
}

async function saveFlow(
	kv: KVNamespace,
	record: OAuthFlowRecord,
): Promise<void> {
	const ttlSec = Math.max(
		1,
		Math.floor((record.expiresAt - Date.now()) / 1000),
	);
	const parsed = oauthFlowRecordSchema.parse(record);
	await kv.put(flowKvKey(record.flowId), JSON.stringify(parsed), {
		expirationTtl: ttlSec,
	});
}

export async function deleteFlow(
	kv: KVNamespace,
	flowId: string,
): Promise<void> {
	await kv.delete(flowKvKey(flowId));
}

export async function advanceFlow(
	kv: KVNamespace,
	flowId: string,
	step: OAuthFlowStep,
	patch: Partial<
		Pick<OAuthFlowRecord, "userId" | "organizationId" | "step">
	> = {},
): Promise<OAuthFlowRecord> {
	const existing = await getFlow(kv, flowId);
	if (!existing) {
		throw new OAuthFlowError("flow_expired");
	}

	const next: OAuthFlowRecord = {
		...existing,
		...patch,
		step,
	};

	await saveFlow(kv, next);
	return next;
}

export async function requireFlow(
	kv: KVNamespace,
	flowId: string,
	options: {
		minStep?: OAuthFlowStep;
		userId?: string;
	} = {},
): Promise<OAuthFlowRecord> {
	const flow = await getFlow(kv, flowId);
	if (!flow) {
		throw new OAuthFlowError("flow_expired");
	}

	if (options.minStep && !isStepAtLeast(flow.step, options.minStep)) {
		throw new OAuthFlowError("flow_step_mismatch");
	}

	if (
		options.userId &&
		options.minStep &&
		isStepAtLeast(options.minStep, "authenticated")
	) {
		if (!flow.userId || flow.userId !== options.userId) {
			throw new OAuthFlowError("flow_user_mismatch");
		}
	} else if (options.userId && flow.userId && flow.userId !== options.userId) {
		throw new OAuthFlowError("flow_user_mismatch");
	}

	return flow;
}

/** Ensure flow exists for this request; create if oauth_query present and no flow_id. */
export async function ensureFlowForRequest(
	kv: KVNamespace,
	url: URL,
): Promise<{ flow: OAuthFlowRecord; oauthQuery: string }> {
	const oauthQuery = extractOAuthQueryFromRequest(url);
	if (!oauthQuery) {
		throw new OAuthFlowError("missing_oauth_query");
	}

	const existingId = url.searchParams.get("flow_id");
	if (existingId) {
		const flow = await requireFlow(kv, existingId);
		return { flow, oauthQuery };
	}

	const flow = await createFlow(kv, oauthQuery);
	return { flow, oauthQuery };
}

export function mergeSearchParamsWithFlow(
	base: URLSearchParams,
	flowId: string,
): URLSearchParams {
	const merged = new URLSearchParams(base);
	merged.set("flow_id", flowId);
	return merged;
}

export function buildOAuthPath(
	path: "/oauth/sign-in" | "/oauth/select-org" | "/oauth/consent",
	searchParams: URLSearchParams,
): string {
	const qs = searchParams.toString();
	return qs ? `${path}?${qs}` : path;
}

/**
 * Fallback consent URL when Better Auth does not return a redirect.
 * Preserves oauth_query and flow_id — never a bare /oauth/consent.
 */
export function buildConsentUrl(flowId: string, oauthQuery: string): string {
	const params = new URLSearchParams();
	params.set("oauth_query", sanitizeOAuthQueryForBetterAuth(oauthQuery));
	params.set("flow_id", flowId);
	const clientId = new URLSearchParams(oauthQuery).get("client_id");
	if (clientId) {
		params.set("client_id", clientId);
	}
	const scope = new URLSearchParams(oauthQuery).get("scope");
	if (scope) {
		params.set("scope", scope);
	}
	return buildOAuthPath("/oauth/consent", params);
}

export function buildSelectOrgUrl(flowId: string, oauthQuery: string): string {
	const params = new URLSearchParams();
	params.set("oauth_query", sanitizeOAuthQueryForBetterAuth(oauthQuery));
	params.set("flow_id", flowId);
	params.set("post_login", "true");
	const clientId = new URLSearchParams(oauthQuery).get("client_id");
	if (clientId) {
		params.set("client_id", clientId);
	}
	return buildOAuthPath("/oauth/select-org", params);
}

/**
 * Resolve where an authenticated user should go next in the MCP OAuth browser flow.
 */
export function resolveAuthenticatedEntryPath(
	flow: OAuthFlowRecord,
	oauthQuery: string,
	originalSearch: URLSearchParams,
): string {
	const scopes = flow.requestedScopes;
	if (requiresOAuthOrgSelection(scopes)) {
		return buildSelectOrgUrl(flow.flowId, oauthQuery);
	}

	const params = mergeSearchParamsWithFlow(originalSearch, flow.flowId);
	params.set("oauth_query", oauthQuery);
	return buildOAuthPath("/oauth/consent", params);
}

export function isTerminalFlowStep(step: OAuthFlowStep): boolean {
	return step === "completed" || step === "failed" || step === "expired";
}

/** Set on consent URL after select-org + oauth2Continue (not used to gate tokens). */
export const OAUTH_HOUSEHOLD_SELECTED_PARAM = "household_selected";

export function isOAuthConsentRedirect(url: string): boolean {
	try {
		return (
			new URL(url, "https://ration.mayutic.com").pathname === "/oauth/consent"
		);
	} catch {
		return false;
	}
}

export function markConsentUrlHouseholdSelected(
	consentPathOrUrl: string,
): string {
	try {
		const parsed = new URL(consentPathOrUrl, "https://ration.mayutic.com");
		parsed.searchParams.set(OAUTH_HOUSEHOLD_SELECTED_PARAM, "1");
		return `${parsed.pathname}${parsed.search}`;
	} catch {
		const separator = consentPathOrUrl.includes("?") ? "&" : "?";
		return `${consentPathOrUrl}${separator}${OAUTH_HOUSEHOLD_SELECTED_PARAM}=1`;
	}
}
