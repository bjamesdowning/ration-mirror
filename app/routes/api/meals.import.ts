import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { meal } from "~/db/schema";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { log } from "~/lib/logging.server";
import { insertQueueJobPending } from "~/lib/queue-job.server";
import { checkRateLimit } from "~/lib/rate-limiter.server";
import { RecipeImportRequestSchema } from "~/lib/schemas/recipe-import";
import type { Route } from "./+types/meals.import";

/** Private IP ranges and known metadata endpoints to block (SSRF mitigation). */
const BLOCKED_HOSTNAMES = new Set([
	"169.254.169.254",
	"metadata.google.internal",
	"169.254.170.2",
	"fd00:ec2::254",
]);

function isBlockedUrl(rawUrl: string): boolean {
	try {
		const { hostname } = new URL(rawUrl);
		if (BLOCKED_HOSTNAMES.has(hostname)) return true;
		const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
		if (ipv4) {
			const a = Number(ipv4[1]);
			const b = Number(ipv4[2]);
			if (a === 10) return true;
			if (a === 172 && b >= 16 && b <= 31) return true;
			if (a === 192 && b === 168) return true;
			if (a === 127) return true;
		}
		return false;
	} catch {
		return false;
	}
}

export async function action({ request, context }: Route.ActionArgs) {
	const {
		session: { user },
		groupId,
	} = await requireActiveGroup(context, request);

	const rateLimitResult = await checkRateLimit(
		context.cloudflare.env.RATION_KV,
		"recipe_import",
		user.id,
	);

	if (!rateLimitResult.allowed) {
		return data(
			{
				error: "Too many import requests. Please try again later.",
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

	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return data({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsedRequest = RecipeImportRequestSchema.safeParse(body);
	if (!parsedRequest.success) {
		const firstIssue = parsedRequest.error.issues[0];
		return data(
			{ error: firstIssue?.message ?? "Invalid request" },
			{ status: 400 },
		);
	}

	const { url: validatedUrl } = parsedRequest.data;

	if (isBlockedUrl(validatedUrl)) {
		return data({ error: "That URL is not accessible." }, { status: 422 });
	}

	// Duplicate detection: check if this URL has already been imported before deducting credits.
	try {
		const db = drizzle(context.cloudflare.env.DB);
		const duplicates = await db
			.select({ id: meal.id, name: meal.name })
			.from(meal)
			.where(
				and(
					eq(meal.organizationId, groupId),
					sql`json_extract(${meal.customFields}, '$.sourceUrl') = ${validatedUrl}`,
				),
			)
			.limit(1);

		if (duplicates.length > 0 && duplicates[0]) {
			const dup = duplicates[0];
			return data(
				{
					success: false,
					code: "DUPLICATE_URL",
					existingMealId: dup.id,
					existingMealName: dup.name,
					error: `This URL has already been imported as "${dup.name}".`,
				},
				{ status: 409 },
			);
		}
	} catch (dedupErr) {
		log.error("Dedup check failed", dedupErr);
	}

	const queue = context.cloudflare.env.IMPORT_URL_QUEUE;
	if (!queue) {
		return data({ error: "Import service unavailable" }, { status: 503 });
	}

	try {
		return await withCreditGate(
			{
				env: context.cloudflare.env,
				organizationId: groupId,
				userId: user.id,
				cost: AI_COSTS.IMPORT_URL,
				reason: "Import URL",
			},
			async () => {
				const requestId = crypto.randomUUID();
				await queue.send({
					requestId,
					organizationId: groupId,
					userId: user.id,
					url: validatedUrl,
					cost: AI_COSTS.IMPORT_URL,
				});
				await insertQueueJobPending(
					context.cloudflare.env.DB,
					requestId,
					"import_url",
					groupId,
				);
				return data({ status: "processing", requestId });
			},
		);
	} catch (error) {
		if (error instanceof InsufficientCreditsError) {
			return data(
				{
					error: "Insufficient credits",
					required: error.required,
					...(typeof error.current === "number"
						? { current: error.current }
						: {}),
				},
				{ status: 402 },
			);
		}
		return handleApiError(error);
	}
}
