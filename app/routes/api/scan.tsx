import { data } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { mapScanSubmitError, submitVisualScan } from "~/lib/scan-submit.server";
import type { Route } from "./+types/scan";

export async function action({ request, context }: Route.ActionArgs) {
	const {
		groupId,
		session: { user },
	} = await requireActiveGroup(context, request);
	const userId = user.id;

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

	const formData = await request.formData();
	const imageFile = formData.get("image");

	if (!imageFile || !(imageFile instanceof File)) {
		throw data({ error: "No file provided" }, { status: 400 });
	}

	try {
		return await submitVisualScan(context.cloudflare.env, {
			imageFile,
			userId,
			organizationId: groupId,
		});
	} catch (outerError: unknown) {
		try {
			mapScanSubmitError(outerError);
		} catch (mapped) {
			throw mapped;
		}
		if (outerError instanceof Response) {
			throw outerError;
		}
		if (isRouteErrorLike(outerError)) {
			throw outerError;
		}
		throw handleApiError(outerError);
	}
}

function isRouteErrorLike(
	error: unknown,
): error is { type: "DataWithResponseInit" } {
	return (
		typeof error === "object" &&
		error !== null &&
		"type" in error &&
		(error as { type: string }).type === "DataWithResponseInit"
	);
}
