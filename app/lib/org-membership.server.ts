import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

/** Whether `userId` is an active member of `organizationId`. */
export async function hasOrgMembership(
	db: D1Database,
	userId: string,
	organizationId: string,
): Promise<boolean> {
	const d1 = drizzle(db, { schema });
	const membership = await d1.query.member.findFirst({
		where: and(
			eq(schema.member.userId, userId),
			eq(schema.member.organizationId, organizationId),
		),
		columns: { id: true },
	});
	return !!membership;
}
