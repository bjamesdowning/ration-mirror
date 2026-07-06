import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	toggleCargoSelection,
	validateCargoOwnership,
} from "~/lib/cargo-selection.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/cargo.$id.toggle-restock";

export async function action({ request, context, params }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const cargoId = params.id;

	if (!cargoId) {
		throw data({ error: "Missing cargo ID" }, { status: 400 });
	}

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"inventory_mutation",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	try {
		await validateCargoOwnership(context.cloudflare.env.DB, groupId, cargoId);
	} catch {
		throw data(
			{ error: "Cargo item not found or unauthorized" },
			{ status: 404 },
		);
	}

	const result = await toggleCargoSelection(
		context.cloudflare.env.DB,
		groupId,
		cargoId,
	);

	return { success: true, cargoId, ...result };
}
