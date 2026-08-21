import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";
import { hasOrgMembership } from "~/lib/org-membership.server";

function isUniqueConstraintError(error: unknown): boolean {
	const text =
		error instanceof Error
			? `${error.message}\n${String(error.cause ?? "")}`
			: String(error);
	return /unique constraint/i.test(text);
}

/**
 * Inserts a missing owner `member` row when `organizationId` is this user's
 * personal org (`personal-${userId}`). Returns true when membership is readable.
 *
 * Ownership is the signup slug only — `metadata.isPersonal` is not enough,
 * because that flag is true for every personal kitchen.
 *
 * Used so App Store 1.3.x can keep a just-minted session instead of 401
 * logout when the signup hook created the org without a member row.
 */
export async function repairPersonalOrgMembership(
	env: Cloudflare.Env,
	userId: string,
	organizationId: string,
): Promise<boolean> {
	if (await hasOrgMembership(env.DB, userId, organizationId)) {
		return true;
	}

	const db = drizzle(env.DB, { schema });
	const org = await db.query.organization.findFirst({
		where: eq(schema.organization.id, organizationId),
		columns: { id: true, slug: true },
	});
	if (!org || org.slug !== `personal-${userId}`) {
		return false;
	}

	try {
		await db.insert(schema.member).values({
			id: crypto.randomUUID(),
			organizationId,
			userId,
			role: "owner",
			createdAt: new Date(),
		});
	} catch (error) {
		if (!isUniqueConstraintError(error)) throw error;
	}

	return hasOrgMembership(env.DB, userId, organizationId);
}
