import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { getCargo } from "~/lib/cargo.server";
import { exportCargoAsCsv } from "~/lib/export.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/cargo.export";

/**
 * GET /api/cargo/export - Export cargo as CSV (session auth, for Cargo page Export button).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId, session } = await requireActiveGroup(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"api_export",
		session.user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many export requests. Please try again later.",
				retryAfter: rateLimitResult.retryAfter,
				resetAt: rateLimitResult.resetAt,
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	const items = await getCargo(context.cloudflare.env.DB, groupId);
	const csv = exportCargoAsCsv(items);
	const date = new Date().toISOString().slice(0, 10);

	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="ration-cargo-${date}.csv"`,
		},
	});
}
