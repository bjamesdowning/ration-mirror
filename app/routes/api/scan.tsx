import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
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
		throw data({ error: "No image file provided" }, { status: 400 });
	}

	if (imageFile.size > 5 * 1024 * 1024) {
		throw data({ error: "Image too large (Max 5MB)" }, { status: 400 });
	}

	const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
	type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];
	const mimeType = imageFile.type as AllowedMimeType;
	if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
		throw data(
			{ error: "Unsupported image format. Use JPEG, PNG, or WebP." },
			{ status: 415 },
		);
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
				const imageKey = `${SCAN_PENDING_PREFIX}${requestId}.jpg`;

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

				// Write pending placeholder so status endpoint returns 200 (not 404) while job is queued
				const JOB_TTL_SECONDS = 3600;
				await env.RATION_KV.put(
					`scan-job:${requestId}`,
					JSON.stringify({ status: "pending", organizationId: groupId }),
					{ expirationTtl: JOB_TTL_SECONDS },
				);

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
