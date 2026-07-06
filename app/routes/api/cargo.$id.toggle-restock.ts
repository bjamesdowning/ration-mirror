import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import {
	toggleCargoSelection,
	validateCargoOwnership,
} from "~/lib/cargo-selection.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { CargoRestockQuantitySchema } from "~/lib/schemas/cargo-selection";
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

	let quantityOverride: number | undefined;
	const contentType = request.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		let json: unknown;
		try {
			json = await request.json();
		} catch {
			throw data({ error: "Invalid JSON body" }, { status: 400 });
		}
		const parsed = CargoRestockQuantitySchema.safeParse(json);
		if (!parsed.success) {
			throw data({ error: "Invalid quantity" }, { status: 400 });
		}
		quantityOverride = parsed.data.quantity;
	}

	const result = await toggleCargoSelection(
		context.cloudflare.env.DB,
		groupId,
		cargoId,
		quantityOverride,
	);

	return { success: true, cargoId, ...result };
}
