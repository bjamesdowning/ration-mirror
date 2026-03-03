/**
 * Shared loader logic for AI queue job status polling endpoints.
 * Handles auth, requestId validation, job fetch, and org-scoping.
 * Each route parses resultJson and shapes the response for its job type.
 */
import type { AppLoadContext } from "react-router";
import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { getQueueJob } from "~/lib/queue-job.server";
import { RequestIdSchema } from "~/lib/schemas/queue";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export interface QueueJobStatusResult {
	job: {
		status: "pending" | "completed" | "failed";
		organizationId: string;
		resultJson: string | null;
	};
	groupId: string;
}

export interface QueueStatusLoaderArgs {
	params: { requestId?: string };
	request: Request;
	context: AppLoadContext;
}

/**
 * Validates auth, requestId, fetches the queue job, and enforces org scoping.
 * Throws data() for 400 invalid requestId or 404 job not found / org mismatch.
 * Returns job and groupId on success.
 */
export async function requireQueueJobForStatus(
	args: QueueStatusLoaderArgs,
): Promise<QueueJobStatusResult> {
	const { groupId } = await requireActiveGroup(args.context, args.request);
	const requestIdResult = RequestIdSchema.safeParse(args.params.requestId);
	if (!requestIdResult.success) {
		throw data(
			{ error: "Invalid request ID" },
			{ status: 400, headers: NO_STORE },
		);
	}
	const requestId = requestIdResult.data;

	const env = (args.context.cloudflare as { env: Env }).env;
	const job = await getQueueJob(env.DB, requestId);
	if (!job) {
		throw data(
			{ error: "Job not found or expired", status: "unknown" },
			{ status: 404, headers: NO_STORE },
		);
	}
	if (job.organizationId !== groupId) {
		throw data(
			{ error: "Job not found or expired", status: "unknown" },
			{ status: 404, headers: NO_STORE },
		);
	}

	return {
		job: {
			status: job.status as "pending" | "completed" | "failed",
			organizationId: job.organizationId,
			resultJson: job.resultJson,
		},
		groupId,
	};
}

/**
 * Parses job resultJson with fallback for malformed JSON.
 * Returns empty object on parse failure to avoid throwing in the loader.
 */
export function parseJobResultJson<T = Record<string, unknown>>(
	resultJson: string | null,
): T {
	if (!resultJson) return {} as T;
	try {
		return JSON.parse(resultJson) as T;
	} catch {
		return {} as T;
	}
}
