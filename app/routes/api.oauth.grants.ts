import { data } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import {
	listConnectedAgentGrants,
	revokeConnectedAgentGrant,
} from "~/lib/oauth.server";

export async function loader({
	request,
	context,
}: {
	request: Request;
	context: AppLoadContext;
}) {
	const session = await requireAuth(context, request);
	const grants = await listConnectedAgentGrants(
		context.cloudflare.env,
		session.user.id,
	);
	return { grants };
}

export async function action({
	request,
	context,
}: {
	request: Request;
	context: AppLoadContext;
}) {
	const session = await requireAuth(context, request);
	const form = await request.formData();
	const intent = form.get("intent");
	const consentId = form.get("consentId");

	if (intent !== "revoke" || typeof consentId !== "string") {
		throw data({ error: "Invalid request" }, { status: 400 });
	}

	const revoked = await revokeConnectedAgentGrant(
		context.cloudflare.env,
		session.user.id,
		consentId,
	);

	if (!revoked) {
		throw data({ error: "Grant not found" }, { status: 404 });
	}

	return { ok: true };
}
