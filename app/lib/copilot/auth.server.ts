import { getAuth } from "../auth.server";
import { getGroupTierLimits } from "../capacity.server";
import {
	assertMobileOrgMembership,
	verifyMobileAccessToken,
} from "../mobile/token.server";
import { hasOrgMembership } from "../org-membership.server";
import { consumeCopilotWebSessionToken } from "./web-session-token.server";

export type CopilotAuthSource = "mobile" | "web";

export interface CopilotIdentity {
	userId: string;
	organizationId: string;
	tier: string;
	source: CopilotAuthSource;
}

function parseBearerToken(request: Request): string | null {
	const header = request.headers.get("Authorization");
	if (!header?.startsWith("Bearer ")) return null;
	const token = header.slice(7).trim();
	return token.length > 0 ? token : null;
}

function parseHandshakeToken(request: Request): string | null {
	const token = new URL(request.url).searchParams.get("handshakeToken")?.trim();
	return token ? token : null;
}

export async function authenticateCopilot(
	env: Cloudflare.Env,
	request: Request,
): Promise<CopilotIdentity> {
	const bearer = parseBearerToken(request);
	if (bearer) {
		const claims = await verifyMobileAccessToken(env, bearer);
		await assertMobileOrgMembership(env, claims.userId, claims.organizationId);
		const tierInfo = await getGroupTierLimits(env, claims.organizationId);
		return {
			userId: claims.userId,
			organizationId: claims.organizationId,
			tier: tierInfo.tier,
			source: "mobile",
		};
	}

	const handshakeToken = parseHandshakeToken(request);
	if (handshakeToken) {
		const identity = await consumeCopilotWebSessionToken(env, handshakeToken);
		if (!identity) throw new Error("copilot_unauthorized");
		return identity;
	}

	const auth = getAuth(env);
	const session = await auth.api.getSession({ headers: request.headers });
	const organizationId = session?.session.activeOrganizationId;
	const userId = session?.user.id;
	if (!session || !organizationId || !userId) {
		throw new Error("copilot_unauthorized");
	}
	const isMember = await hasOrgMembership(env.DB, userId, organizationId);
	if (!isMember) {
		throw new Error("copilot_forbidden_org");
	}
	const tierInfo = await getGroupTierLimits(env, organizationId);

	return {
		userId,
		organizationId,
		tier: tierInfo.tier,
		source: "web",
	};
}
