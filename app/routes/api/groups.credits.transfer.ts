import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { InsufficientCreditsError, transferCredits } from "~/lib/ledger.server";
import { log, redactId } from "~/lib/logging.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { TransferCreditsSchema } from "~/lib/schemas/credits-transfer";
import type { Route } from "./+types/groups.credits.transfer";

export async function action({ request, context }: Route.ActionArgs) {
	const { user } = await requireAuth(context, request);
	const env = context.cloudflare.env;
	const db = drizzle(env.DB, { schema });

	const rateLimitResult = await checkRateLimit(
		env.RATION_KV,
		"credits_transfer",
		user.id,
	);
	if (!rateLimitResult.allowed) {
		throw data(
			{ error: "Too many requests. Please try again later." },
			{ status: 429, headers: { "Retry-After": "60" } },
		);
	}

	const formData = await request.formData();
	const raw = {
		sourceOrganizationId: formData.get("sourceOrganizationId")?.toString(),
		destinationOrganizationId: formData
			.get("destinationOrganizationId")
			?.toString(),
		amount: formData.get("amount"),
	};

	const parsed = TransferCreditsSchema.safeParse(raw);
	if (!parsed.success) {
		return handleApiError(parsed.error);
	}

	const { sourceOrganizationId, destinationOrganizationId, amount } =
		parsed.data;

	// Verify source: user must be owner
	const sourceMembership = await db.query.member.findFirst({
		where: (m, { and, eq }) =>
			and(eq(m.organizationId, sourceOrganizationId), eq(m.userId, user.id)),
	});

	if (!sourceMembership || sourceMembership.role !== "owner") {
		throw data(
			{
				error: "You must be the owner of the source group to transfer credits",
			},
			{ status: 403 },
		);
	}

	// Verify destination: user must be member or owner
	const destMembership = await db.query.member.findFirst({
		where: (m, { and, eq }) =>
			and(
				eq(m.organizationId, destinationOrganizationId),
				eq(m.userId, user.id),
			),
	});

	if (!destMembership) {
		throw data(
			{
				error:
					"You must be a member of the destination group to receive credits",
			},
			{ status: 403 },
		);
	}

	try {
		await transferCredits(
			env,
			sourceOrganizationId,
			destinationOrganizationId,
			user.id,
			amount,
		);

		log.info("[TransferCredits] Success", {
			sourceOrgId: redactId(sourceOrganizationId),
			destOrgId: redactId(destinationOrganizationId),
			amount,
			userId: redactId(user.id),
		});

		return data({ success: true });
	} catch (error) {
		if (error instanceof InsufficientCreditsError) {
			throw data(
				{
					error: "Insufficient credits",
					required: error.required,
					current: error.current,
				},
				{ status: 400 },
			);
		}
		log.error("[TransferCredits] Failed", error, {
			sourceOrgId: redactId(sourceOrganizationId),
			destOrgId: redactId(destinationOrganizationId),
			userId: redactId(user.id),
		});
		return handleApiError(error);
	}
}
