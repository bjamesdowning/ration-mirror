import { data } from "react-router";
import {
	addOrMergeItem,
	getCargoCount,
	getCargoPage,
} from "~/lib/cargo.server";
import { handleApiError } from "~/lib/error-handler";
import { decodeCursor, encodeCursor } from "~/lib/mcp/envelope";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { paginatedResponse } from "~/lib/mobile/responses.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	MobileCargoListQuerySchema,
	MobileCreateCargoSchema,
} from "~/lib/schemas/mobile/cargo";
import type { Route } from "./+types/v1.cargo";

export async function loader({ request, context }: Route.LoaderArgs) {
	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"cargo_list",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please slow down." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const url = new URL(request.url);
		const query = MobileCargoListQuerySchema.parse({
			limit: url.searchParams.get("limit") ?? undefined,
			cursor: url.searchParams.get("cursor") ?? undefined,
			domain: url.searchParams.get("domain") ?? undefined,
		});

		const cursorPayload = query.cursor ? decodeCursor(query.cursor) : null;
		const page = await getCargoPage(context.cloudflare.env.DB, organizationId, {
			limit: query.limit,
			cursor: cursorPayload
				? {
						createdAt: new Date(cursorPayload.createdAt),
						id: cursorPayload.id,
					}
				: null,
			domain: query.domain,
		});

		const nextCursor = page.nextCursor
			? encodeCursor({
					createdAt: page.nextCursor.createdAt.toISOString(),
					id: page.nextCursor.id,
				})
			: null;

		const total = await getCargoCount(
			context.cloudflare.env.DB,
			organizationId,
			query.domain,
		);

		return {
			...paginatedResponse(page.items, nextCursor),
			total,
		};
	} catch (e) {
		return handleApiError(e);
	}
}

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId, organizationId } = await requireMobileActiveGroup(
			context,
			request,
		);

		const rateLimitResult = await checkRateLimit(
			context.cloudflare.env.RATION_KV,
			"inventory_mutation",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const body = await request.json();
		const input = MobileCreateCargoSchema.parse(body);
		const result = await addOrMergeItem(
			context.cloudflare.env,
			organizationId,
			input,
			{
				waitUntil: context.cloudflare.ctx.waitUntil.bind(
					context.cloudflare.ctx,
				),
			},
		);

		if (result.status === "merge_candidate") {
			return data(
				{
					status: "merge_candidate",
					candidate: result.candidate,
				},
				{ status: 409 },
			);
		}
		if (result.status === "invalid_merge_target") {
			return data(
				{ error: "Invalid merge target", code: "invalid_merge_target" },
				{ status: 400 },
			);
		}

		return { item: result.item };
	} catch (e) {
		return handleApiError(e);
	}
}
