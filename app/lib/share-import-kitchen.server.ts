import { data } from "react-router";
import { isVersionAtLeast } from "~/lib/client-version";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/context.server";

/** Share kitchen picker. Builds below this one keep the active-kitchen submit. */
export const SHARE_IMPORT_KITCHEN_PICKER_IOS_MIN = "1.6.49";

/**
 * The picker is an iOS share-sheet control. Web and iOS below 1.6.49 fail closed
 * even when Flagship is on. `X-Ration-Client` is the only version source.
 */
export function shareImportKitchenPickerClientAllowed(
	context: FlagshipEvaluationContext,
): boolean {
	if (context.clientPlatform !== "ios") return false;
	const version = context.clientVersion;
	return (
		typeof version === "string" &&
		isVersionAtLeast(version, SHARE_IMPORT_KITCHEN_PICKER_IOS_MIN)
	);
}

/**
 * Kitchen tenancy. The client may name a kitchen. This returns the verified
 * member row's organization id, or the session's active kitchen when the
 * body omits one. A non-member id is rejected.
 */
export async function resolveImportOrganization(
	env: Cloudflare.Env,
	userId: string,
	activeOrganizationId: string,
	requested: string | undefined,
): Promise<string> {
	if (!requested || requested === activeOrganizationId) {
		return activeOrganizationId;
	}
	const row = await env.DB.prepare(
		`SELECT organization_id FROM member
		 WHERE user_id = ?1 AND organization_id = ?2`,
	)
		.bind(userId, requested)
		.first<{ organization_id: string }>();
	if (!row) {
		throw data(
			{ error: "Organization access denied", code: "forbidden_org" },
			{ status: 403 },
		);
	}
	return row.organization_id;
}
