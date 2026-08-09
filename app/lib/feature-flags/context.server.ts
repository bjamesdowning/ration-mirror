/** Attributes passed to env.FLAGS.getBooleanValue(key, false, context). */
export type FlagshipEvaluationContext = Record<
	string,
	string | number | boolean
>;

type SessionUser = {
	id: string;
	isAdmin?: boolean | null;
};

type BuildFlagContextOptions = {
	plan?: string;
};

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

/**
 * Build Flagship evaluation context from request, Worker env, and optional session.
 * Use stable attribute names (`userId`, `country`, `environment`, `clientPlatform`,
 * `clientVersion`) for targeting rules.
 */
export function buildFlagContext(
	request: Request,
	env: { RATION_ENV?: string },
	session?: { user?: SessionUser | null } | null,
	options?: BuildFlagContextOptions,
): FlagshipEvaluationContext {
	const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
	const country =
		typeof cf?.country === "string" && cf.country.length > 0
			? cf.country
			: "unknown";

	const context: FlagshipEvaluationContext = { country };

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
