/**
 * Admin alert when background account/group purge fails after access was revoked.
 */

import { sendEmail } from "~/lib/email.server";
import { log, redactId } from "~/lib/logging.server";

const PURGE_FAILURE_TO = "help@mayutic.com";

export type PurgeFailureKind = "account" | "group";

export async function notifyPurgeFailure(
	env: Cloudflare.Env,
	params: {
		kind: PurgeFailureKind;
		/** Redacted-safe id (already redacted or raw — we redact again). */
		resourceId: string;
		errorMessage: string;
	},
): Promise<void> {
	const resourceId = redactId(params.resourceId);
	const subject = `[Ration] ${params.kind} purge failed (${resourceId})`;
	const text = [
		`A background ${params.kind} purge failed after access was revoked.`,
		``,
		`Kind: ${params.kind}`,
		`Resource ID (redacted): ${resourceId}`,
		`Error: ${params.errorMessage}`,
		``,
		`Investigate and re-run cleanup if needed. The user may already be signed out / locked out of the group.`,
	].join("\n");

	const html = `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;">${text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")}</pre>`;

	if (!env.EMAIL) {
		log.error("[Purge] EMAIL binding missing; cannot notify purge failure", {
			kind: params.kind,
			resourceId,
		});
		return;
	}

	try {
		await sendEmail(env.EMAIL, {
			to: PURGE_FAILURE_TO,
			subject,
			html,
			text,
		});
	} catch (error) {
		log.error("[Purge] Failed to send purge-failure email", error, {
			kind: params.kind,
			resourceId,
		});
	}
}
