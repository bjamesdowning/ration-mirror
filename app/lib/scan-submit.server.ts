import { data } from "react-router";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { insertQueueJobPending } from "~/lib/queue-job.server";

const SCAN_PENDING_PREFIX = "scan-pending/";

const ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
] as const;

type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export interface SubmitVisualScanInput {
	imageFile: File;
	userId: string;
	organizationId: string;
}

export async function submitVisualScan(
	env: Cloudflare.Env,
	input: SubmitVisualScanInput,
) {
	const { imageFile, userId, organizationId } = input;

	const mimeType = imageFile.type as AllowedMimeType;
	if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
		throw data(
			{ error: "Unsupported file format. Use JPEG, PNG, WebP, or PDF." },
			{ status: 415 },
		);
	}

	if (imageFile.size > 5 * 1024 * 1024) {
		throw data({ error: "File too large (Max 5MB)" }, { status: 400 });
	}

	const SCAN_QUEUE = env.SCAN_QUEUE;
	if (!SCAN_QUEUE) {
		throw data(
			{ error: "Scan service unavailable. Please try again later." },
			{ status: 503 },
		);
	}

	return withCreditGate(
		{
			env,
			organizationId,
			userId,
			cost: AI_COSTS.SCAN,
			reason: "Visual Scan",
		},
		async () => {
			const requestId = crypto.randomUUID();
			const ext = mimeType === "application/pdf" ? "pdf" : "jpg";
			const imageKey = `${SCAN_PENDING_PREFIX}${requestId}.${ext}`;

			const arrayBuffer = await imageFile.arrayBuffer();
			await env.STORAGE.put(imageKey, arrayBuffer, {
				httpMetadata: { contentType: mimeType },
			});

			await SCAN_QUEUE.send({
				requestId,
				organizationId,
				userId,
				imageKey,
				mimeType,
				filename: imageFile.name || undefined,
				cost: AI_COSTS.SCAN,
			});

			await insertQueueJobPending(env.DB, requestId, "scan", organizationId);

			return { status: "processing" as const, requestId };
		},
	);
}

export function mapScanSubmitError(outerError: unknown): void {
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
}
