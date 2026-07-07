import { and, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { cargo } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { normalizeForCargoDedup } from "~/lib/matching.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { SearchQuerySchema } from "~/lib/schemas/search";
import type { Route } from "./+types/search";

export async function loader({ request, context }: Route.LoaderArgs) {
	// 1. Auth & Group Context
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);

	const url = new URL(request.url);
	const rawQ = url.searchParams.get("q");

	const parsed = SearchQuerySchema.safeParse(rawQ ?? "");
	if (!parsed.success) {
		if (!rawQ || rawQ.trim().length < 2) {
			return { results: [] };
		}
		throw handleApiError(parsed.error);
	}
	const q = parsed.data;

	// 2. Rate Limiting
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"search",
		user.id,
	);

	if (!rateLimitResult.allowed) {
		throw rateLimitResponse(
			rateLimitResult,
			"Too many search requests. Please try again later.",
			{ includeBodyMetadata: true },
		);
	}

	// 3. Database Search
	// Normalize the query to expand synonyms (e.g. "tinned" → "canned") so a
	// user searching a regional variant still finds canonically-stored items.
	// We OR both patterns so we also match items stored under the variant form.
	const db = drizzle(context.cloudflare.env.DB);
	const rawPattern = `%${q.toLowerCase()}%`;
	const normalizedTerm = normalizeForCargoDedup(q);
	const normalizedPattern =
		normalizedTerm !== q.toLowerCase() ? `%${normalizedTerm}%` : null;

	const nameConditions = normalizedPattern
		? or(like(cargo.name, rawPattern), like(cargo.name, normalizedPattern))
		: like(cargo.name, rawPattern);

	const items = await db
		.select()
		.from(cargo)
		.where(and(eq(cargo.organizationId, groupId), nameConditions))
		.orderBy(desc(cargo.createdAt))
		.limit(20);

	return { results: items };
}
