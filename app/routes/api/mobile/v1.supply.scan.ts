import { data } from "react-router";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import {
	SupplyScanCompleteRequestSchema,
	SupplyScanMatchQuerySchema,
} from "~/lib/schemas/supply-scan";
import {
	completeSupplyScan,
	getSupplyScanMatch,
	SupplyScanError,
	validateSupplyOnlyIds,
} from "~/lib/supply-scan.server";
import type { Route } from "./+types/v1.supply.scan";

export async function loader({ request, context }: Route.LoaderArgs) {
	const { userId, organizationId } = await requireMobileActiveGroup(
		context,
		request,
	);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"status_poll",
		userId,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	const url = new URL(request.url);
	const listId = url.searchParams.get("listId");
	if (!listId) {
		throw data({ error: "listId is required" }, { status: 400 });
	}

	const parsed = SupplyScanMatchQuerySchema.safeParse({
		requestId: url.searchParams.get("requestId"),
	});
	if (!parsed.success) {
		throw data({ error: "Invalid requestId" }, { status: 400 });
	}

	try {
		return await getSupplyScanMatch(
			context.cloudflare.env,
			organizationId,
			listId,
			parsed.data.requestId,
		);
	} catch (e) {
		if (e instanceof SupplyScanError) {
			const status =
				e.code === "job_not_found" || e.code === "list_not_found" ? 404 : 400;
			throw data({ error: e.message, code: e.code }, { status });
		}
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
			"inventory_batch",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw data(
				{ error: "Too many requests. Please try again later." },
				{ status: 429, headers: { "Retry-After": "60" } },
			);
		}

		const json = await request.json();
		const body = json as { listId?: string } & Record<string, unknown>;
		const listId = body.listId;
		if (!listId || typeof listId !== "string") {
			throw data({ error: "listId is required" }, { status: 400 });
		}

		const parsed = SupplyScanCompleteRequestSchema.safeParse(body);
		if (!parsed.success) {
			throw data(
				{ error: "Invalid request", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		await validateSupplyOnlyIds(
			context.cloudflare.env,
			listId,
			parsed.data.supplyOnlyIds,
		);

		return await completeSupplyScan(
			context.cloudflare.env,
			organizationId,
			listId,
			parsed.data,
		);
	} catch (e) {
		if (e instanceof SupplyScanError) {
			const status =
				e.code === "list_not_found" || e.code === "job_not_found" ? 404 : 400;
			throw data({ error: e.message, code: e.code }, { status });
		}
		return handleApiError(e);
	}
}
