import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import * as schema from "~/db/schema";
import { createApiKey } from "~/lib/api-key.server";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { CreateApiKeySchema } from "~/lib/schemas/api-keys";
import type { Route } from "./+types/api-keys";

/**
 * GET /api/api-keys - List API keys for the current organization (session auth).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const { groupId } = await requireActiveGroup(context, request);
	const db = drizzle(context.cloudflare.env.DB, { schema });

	const keys = await db.query.apiKey.findMany({
		where: eq(schema.apiKey.organizationId, groupId),
		columns: {
			id: true,
			keyPrefix: true,
			name: true,
			scopes: true,
			lastUsedAt: true,
			createdAt: true,
		},
	});

	return {
		keys: keys.map((k) => ({
			id: k.id,
			keyPrefix: k.keyPrefix,
			name: k.name,
			scopes: k.scopes,
			lastUsedAt: k.lastUsedAt,
			createdAt: k.createdAt,
		})),
	};
}

/**
 * POST /api/api-keys - Create a new API key (session auth).
 * Body: { name: string, scopes: string[] }. Key is scoped to current organization.
 */
export async function action({ request, context }: Route.ActionArgs) {
	const { groupId, session } = await requireActiveGroup(context, request);

	if (request.method !== "POST") {
		throw data({ error: "Method not allowed" }, { status: 405 });
	}

	let rawName: string;
	let rawScopes: string[];
	const contentType = request.headers.get("Content-Type") ?? "";
	if (contentType.includes("application/json")) {
		try {
			const body = (await request.json()) as {
				name?: unknown;
				scopes?: unknown;
			};
			rawName = typeof body?.name === "string" ? body.name : "";
			rawScopes = Array.isArray(body?.scopes)
				? body.scopes.filter((s): s is string => typeof s === "string")
				: [];
		} catch {
			throw data({ error: "Invalid JSON" }, { status: 400 });
		}
	} else {
		const formData = await request.formData();
		rawName = (formData.get("name") ?? "").toString().trim();
		rawScopes = formData.getAll("scopes").map(String);
	}

	const parsed = CreateApiKeySchema.safeParse({
		name: rawName,
		scopes: rawScopes,
	});
	if (!parsed.success) {
		return handleApiError(parsed.error);
	}

	const { name, scopes } = parsed.data;

	try {
		const { key, prefix, record } = await createApiKey(
			context.cloudflare.env,
			groupId,
			session.user.id,
			name,
			scopes,
		);

		return {
			key,
			prefix,
			id: record.id,
			name: record.name,
			scopes: record.scopes,
			createdAt: record.createdAt,
		};
	} catch (e) {
		return handleApiError(e);
	}
}
