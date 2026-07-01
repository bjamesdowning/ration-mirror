import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { MobileSupplyListQuerySchema } from "~/lib/schemas/mobile/supply";
import { getSupplyList } from "~/lib/supply.server";
import type { Route } from "./+types/v1.supply";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"supply_read",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many supply requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const url = new URL(request.url);
		const { limit, offset } = MobileSupplyListQuerySchema.parse({
			limit: url.searchParams.get("limit") ?? undefined,
			offset: url.searchParams.get("offset") ?? undefined,
		});

		const list = await getSupplyList(
			context.cloudflare.env.DB,
			organizationId,
			{
				limit,
				offset,
			},
		);
		return { list };
	} catch (e) {
		return handleApiError(e);
	}
}
