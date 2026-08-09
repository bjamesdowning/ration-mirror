import { APP_VERSION } from "~/lib/version";

/** Attributes passed to env.FLAGS.getBooleanValue(key, false, context). */
export type FlagshipEvaluationContext = Record<
	string,
	string | number | boolean
>;

/** Trusted client surfaces for Flagship evaluation (server-owned). */
export type ClientSurface = "web" | "ios" | "mcp" | "copilot" | "system";

/** Agent surfaces that evaluate Flagship without an HTTP `X-Ration-Client` header. */
export type AgentFlagPlatform = "mcp" | "copilot";

type SessionUser = {
	id: string;
	isAdmin?: boolean | null;
};

type BuildFlagContextOptions = {
	plan?: string;
};

export class InvalidRationClientHeaderError extends Error {
	override name = "InvalidRationClientHeaderError" as const;
	constructor(message: string) {
		super(message);
	}
}

/**
 * Parse `X-Ration-Client` (`ios/1.3.17`, `web/1.7.34`) into Flagship attributes.
 */
export function parseRationClientHeader(header: string | null | undefined): {
	clientPlatform?: string;
	clientVersion?: string;
} {
	const trimmed = header?.trim();
	if (!trimmed) return {};
	const slash = trimmed.indexOf("/");
	if (slash <= 0) {
		return { clientPlatform: trimmed.slice(0, 64) };
	}
	const platform = trimmed.slice(0, slash).slice(0, 64);
	const version = trimmed
		.slice(slash + 1)
		.trim()
		.slice(0, 64);
	const out: { clientPlatform?: string; clientVersion?: string } = {};
	if (platform) out.clientPlatform = platform;
	if (version) out.clientVersion = version;
	return out;
}

function baseContext(
	request: Request | null,
	env: { RATION_ENV?: string },
	session?: { user?: SessionUser | null } | null,
	options?: BuildFlagContextOptions,
): FlagshipEvaluationContext {
	const context: FlagshipEvaluationContext = {};

	if (request) {
		const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
		const country =
			typeof cf?.country === "string" && cf.country.length > 0
				? cf.country
				: "unknown";
		context.country = country;
	}

	const environment = env.RATION_ENV?.trim();
	if (environment) {
		context.environment = environment;
	}

	const userId = session?.user?.id;
	if (userId) {
		context.userId = userId;
	}

	if (session?.user?.isAdmin) {
		context.isAdmin = "true";
	}

	if (options?.plan) {
		context.plan = options.plan;
	}

	return context;
}

/**
 * Web browser / Hub Flagship context. Platform and version are server-owned;
 * `X-Ration-Client` cannot force ios/mcp/copilot.
 */
export function buildWebFlagContext(
	request: Request,
	env: { RATION_ENV?: string },
	session?: { user?: SessionUser | null } | null,
	options?: BuildFlagContextOptions,
): FlagshipEvaluationContext {
	const context = baseContext(request, env, session, options);
	context.clientPlatform = "web";
	context.clientVersion = APP_VERSION;
	return context;
}

/**
 * iOS mobile Flagship context. Platform is always `ios`; marketing/build version
 * may be taken from `X-Ration-Client` when the reported platform is ios.
 * A mismatched header platform is rejected.
 */
export function buildMobileFlagContext(
	request: Request,
	env: { RATION_ENV?: string },
	session?: { user?: SessionUser | null } | null,
	options?: BuildFlagContextOptions,
): FlagshipEvaluationContext {
	const context = baseContext(request, env, session, options);
	const reported = parseRationClientHeader(
		request.headers.get("X-Ration-Client"),
	);
	if (
		reported.clientPlatform &&
		reported.clientPlatform !== "ios" &&
		reported.clientPlatform !== "mobile"
	) {
		throw new InvalidRationClientHeaderError(
			`X-Ration-Client platform '${reported.clientPlatform}' is not valid for mobile API.`,
		);
	}
	context.clientPlatform = "ios";
	if (reported.clientVersion) {
		context.clientVersion = reported.clientVersion;
	}
	return context;
}

/**
 * Background / system Flagship context (no Request). Platform is always `system`.
 */
export function buildSystemFlagContext(
	env: { RATION_ENV?: string },
	userId?: string | null,
	options?: {
		originatingSurface?: ClientSurface;
		originatingClientVersion?: string | null;
	},
): FlagshipEvaluationContext {
	const context: FlagshipEvaluationContext = {
		clientPlatform: options?.originatingSurface ?? "system",
		environment: env.RATION_ENV?.trim() || "unknown",
	};
	if (userId) {
		context.userId = userId;
	}
	if (options?.originatingClientVersion) {
		context.clientVersion = options.originatingClientVersion;
	}
	return context;
}

/**
 * @deprecated Prefer {@link buildWebFlagContext} or {@link buildMobileFlagContext}.
 * Legacy helper that still honors `X-Ration-Client` platform for non-migrated call sites.
 */
export function buildFlagContext(
	request: Request,
	env: { RATION_ENV?: string },
	session?: { user?: SessionUser | null } | null,
	options?: BuildFlagContextOptions,
): FlagshipEvaluationContext {
	const context = baseContext(request, env, session, options);
	const client = parseRationClientHeader(
		request.headers.get("X-Ration-Client"),
	);
	if (client.clientPlatform) {
		context.clientPlatform = client.clientPlatform;
	}
	if (client.clientVersion) {
		context.clientVersion = client.clientVersion;
	}
	return context;
}

/**
 * Flagship context for MCP / Copilot tool runs (no Request / X-Ration-Client).
 * Uses explicit `clientPlatform` + web `APP_VERSION` — never invents ios/1.3.25.
 */
export function buildAgentFlagContext(
	env: { RATION_ENV?: string },
	userId: string | null | undefined,
	platform: AgentFlagPlatform,
): FlagshipEvaluationContext {
	const context: FlagshipEvaluationContext = {
		clientPlatform: platform,
		clientVersion: APP_VERSION,
	};

	const environment = env.RATION_ENV?.trim();
	if (environment) {
		context.environment = environment;
	}

	if (userId) {
		context.userId = userId;
	}

	return context;
}
