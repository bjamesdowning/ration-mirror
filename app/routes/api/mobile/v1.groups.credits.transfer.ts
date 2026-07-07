import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { handleApiError } from "~/lib/error-handler";
import { InsufficientCreditsError, transferCredits } from "~/lib/ledger.server";
import { log, redactId } from "~/lib/logging.server";
import { requireMobileAuth } from "~/lib/mobile/auth.server";
import { checkRateLimit, rateLimitResponse } from "~/lib/rate-limiter.server";
import { TransferCreditsSchema } from "~/lib/schemas/credits-transfer";
import type { Route } from "./+types/v1.groups.credits.transfer";

export async function action({ request, context }: Route.ActionArgs) {
	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	try {
		const { userId } = await requireMobileAuth(context, request);
		const env = context.cloudflare.env;
		const db = drizzle(env.DB, { schema });

		const rateLimitResult = await checkRateLimit(
			env.RATION_KV,
			"credits_transfer",
			userId,
		);
		if (!rateLimitResult.allowed) {
			throw rateLimitResponse(
				rateLimitResult,
				"Too many requests. Please try again later.",
			);
		}

		const body = await request.json();
		const parsed = TransferCreditsSchema.safeParse(body);
		if (!parsed.success) {
			return handleApiError(parsed.error);
		}

		const { sourceOrganizationId, destinationOrganizationId, amount } =
			parsed.data;

		const sourceMembership = await db.query.member.findFirst({
			where: (m, { and, eq }) =>
				and(eq(m.organizationId, sourceOrganizationId), eq(m.userId, userId)),
		});

		if (!sourceMembership || sourceMembership.role !== "owner") {
			throw data(
				{
					error:
						"You must be the owner of the source group to transfer credits",
				},
				{ status: 403 },
			);
		}

		const destMembership = await db.query.member.findFirst({
			where: (m, { and, eq }) =>
				and(
					eq(m.organizationId, destinationOrganizationId),
					eq(m.userId, userId),
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

		await transferCredits(
			env,
			sourceOrganizationId,
			destinationOrganizationId,
			userId,
			amount,
		);

		log.info("[MobileTransferCredits] Success", {
			sourceOrgId: redactId(sourceOrganizationId),
			destOrgId: redactId(destinationOrganizationId),
			amount,
			userId: redactId(userId),
		});

		return { success: true };
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
		return handleApiError(error);
	}
}
