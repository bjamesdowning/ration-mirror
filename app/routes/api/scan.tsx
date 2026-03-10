import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { insertQueueJobPending } from "~/lib/queue-job.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import type { Route } from "./+types/scan";

const SCAN_PENDING_PREFIX = "scan-pending/";

export async function action({ request, context }: Route.ActionArgs) {
	// 1. Auth & Group Context
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const userId = user.id;

	// 2. Rate Limiting (Distributed via KV)
	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"scan",
		userId,
	);

	if (!rateLimitResult.allowed) {
		throw data(
			{
				error: "Too many scan requests. Please try again later.",
				retryAfter: rateLimitResult.retryAfter,
				resetAt: rateLimitResult.resetAt,
			},
			{
				status: 429,
				headers: {
					"Retry-After": rateLimitResult.retryAfter?.toString() || "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
				},
			},
		);
	}

	// 3. Parse Input
	const formData = await request.formData();
	const imageFile = formData.get("image");

	if (!imageFile || !(imageFile instanceof File)) {
		throw data({ error: "No file provided" }, { status: 400 });
	}

	const ALLOWED_MIME_TYPES = [
		"image/jpeg",
		"image/png",
		"image/webp",
		"application/pdf",
	] as const;
	type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];
	const mimeType = imageFile.type as AllowedMimeType;
	if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
		throw data(
			{ error: "Unsupported file format. Use JPEG, PNG, WebP, or PDF." },
			{ status: 415 },
		);
	}

	// 5 MB cap for all types — keeps AI processing costs bounded and prevents large-PDF abuse
	if (imageFile.size > 5 * 1024 * 1024) {
		throw data({ error: "File too large (Max 5MB)" }, { status: 400 });
	}

	// 4. Credit gate, upload to R2, enqueue, return processing status
	try {
		return await withCreditGate(
			{
				env: context.cloudflare.env,
				organizationId: groupId,
				userId,
				cost: AI_COSTS.SCAN,
				reason: "Visual Scan",
			},
			async () => {
				const env = context.cloudflare.env;
				const SCAN_QUEUE = env.SCAN_QUEUE;

				if (!SCAN_QUEUE) {
					throw data(
						{ error: "Scan service unavailable. Please try again later." },
						{ status: 503 },
					);
				}

				const requestId = crypto.randomUUID();
				const ext = mimeType === "application/pdf" ? "pdf" : "jpg";
				const imageKey = `${SCAN_PENDING_PREFIX}${requestId}.${ext}`;

				// Upload image to R2 for consumer to process
				const arrayBuffer = await imageFile.arrayBuffer();
				await env.STORAGE.put(imageKey, arrayBuffer, {
					httpMetadata: {
						contentType: mimeType,
					},
				});

				// Enqueue scan job
				await SCAN_QUEUE.send({
					requestId,
					organizationId: groupId,
					userId,
					imageKey,
					mimeType,
					filename: imageFile.name || undefined,
					cost: AI_COSTS.SCAN,
				});

				// D1-backed pending (strong consistency for status polling)
				await insertQueueJobPending(env.DB, requestId, "scan", groupId);

				return { status: "processing", requestId };
			},
		);
	} catch (outerError) {
		if (outerError instanceof InsufficientCreditsError) {
			throw data(
				{
					error: "Insufficient credits",
					required: outerError.required,
					current: outerError.current,
				},
				{ status: 402 },
			);
		}
		if (
			outerError instanceof Response ||
			(outerError &&
				typeof outerError === "object" &&
				"type" in outerError &&
				(outerError as { type: string }).type === "DataWithResponseInit")
		) {
			throw outerError;
		}
		throw handleApiError(outerError);
	}
}
