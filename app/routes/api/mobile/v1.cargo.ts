import { data } from "react-router";
import {
	addOrMergeItem,
	attachTagsToCargo,
	getCargoCount,
	getCargoPage,
} from "~/lib/cargo.server";
import { getActiveCargoIds } from "~/lib/cargo-selection.server";
import { handleApiError } from "~/lib/error-handler";
import { decodeCursor, encodeCursor } from "~/lib/mcp/envelope";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { paginatedResponse } from "~/lib/mobile/responses.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import {
	MobileCargoListQuerySchema,
	MobileCreateCargoSchema,
} from "~/lib/schemas/mobile/cargo";
import { tagsToSlugs } from "~/lib/tags.server";
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
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please slow down.",
			);
		}

		const url = new URL(request.url);
		const query = MobileCargoListQuerySchema.parse({
			limit: url.searchParams.get("limit") ?? undefined,
			cursor: url.searchParams.get("cursor") ?? undefined,
			domain: url.searchParams.get("domain") ?? undefined,
		});

		const cursorPayload = query.cursor ? decodeCursor(query.cursor) : null;
		const [page, total, activeCargoIds] = await Promise.all([
			getCargoPage(context.cloudflare.env.DB, organizationId, {
				limit: query.limit,
				cursor: cursorPayload
					? {
							sortBy: "createdAt",
							createdAt: new Date(cursorPayload.createdAt),
							id: cursorPayload.id,
						}
					: null,
				domain: query.domain,
			}),
			getCargoCount(context.cloudflare.env.DB, organizationId, query.domain),
			getActiveCargoIds(context.cloudflare.env.DB, organizationId),
		]);

		const nextCursor =
			page.nextCursor?.sortBy === "createdAt"
				? encodeCursor({
						createdAt: page.nextCursor.createdAt.toISOString(),
						id: page.nextCursor.id,
					})
				: null;

		const itemsWithTags = await attachTagsToCargo(
			context.cloudflare.env.DB,
			page.items,
		);
		const items = itemsWithTags.map((item) => ({
			...item,
			tags: tagsToSlugs(item.tags),
		}));

		return {
			...paginatedResponse(items, nextCursor),
			total,
			activeCargoIds,
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
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
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

		const [withTags] = await attachTagsToCargo(context.cloudflare.env.DB, [
			result.item,
		]);
		return {
			item: { ...withTags, tags: tagsToSlugs(withTags.tags) },
		};
	} catch (e) {
		return handleApiError(e);
	}
}
