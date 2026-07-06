import { and, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { cargo } from "~/db/schema";
import { handleApiError } from "~/lib/error-handler";
import { normalizeForCargoDedup } from "~/lib/matching.server";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { SearchQuerySchema } from "~/lib/schemas/search";
import type { Route } from "./+types/v1.search";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

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

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"search",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many search requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "10" } },
			);
		}

		const normalized = normalizeForCargoDedup(q);
		const db = drizzle(context.cloudflare.env.DB);
		const results = await db
			.select({
				id: cargo.id,
				name: cargo.name,
				quantity: cargo.quantity,
				unit: cargo.unit,
				baseQuantity: cargo.baseQuantity,
				baseUnit: cargo.baseUnit,
				domain: cargo.domain,
			})
			.from(cargo)
			.where(
				and(
					eq(cargo.organizationId, organizationId),
					or(like(cargo.name, `%${normalized}%`), like(cargo.name, `%${q}%`)),
				),
			)
			.orderBy(desc(cargo.updatedAt))
			.limit(20);

		return { results };
	} catch (e) {
		return handleApiError(e);
	}
}
