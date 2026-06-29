import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/db/schema";

export async function getOrganizationRecord(
	env: Cloudflare.Env,
	organizationId: string,
) {
	const db = drizzle(env.DB, { schema });
	return db.query.organization.findFirst({
		where: eq(schema.organization.id, organizationId),
		columns: {
			id: true,
			name: true,
			slug: true,
			logo: true,
			credits: true,
		},
	});
}
