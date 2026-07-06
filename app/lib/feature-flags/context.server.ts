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
 * Build Flagship evaluation context from request, Worker env, and optional session.
 * Use stable attribute names (`userId`, `country`, `environment`) for targeting rules.
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

	return context;
}
