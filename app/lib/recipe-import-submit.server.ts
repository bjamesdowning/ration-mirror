import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { meal } from "~/db/schema";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/flags.server";
import {
	AI_COSTS,
	InsufficientCreditsError,
	withCreditGate,
} from "~/lib/ledger.server";
import { log } from "~/lib/logging.server";
import { insertQueueJobPending } from "~/lib/queue-job.server";
import {
	importPageR2Key,
	utf8ByteLength,
} from "~/lib/recipe-import-block.server";
import { RECIPE_IMPORT_PAGE_HTML_MAX } from "~/lib/schemas/recipe-import";

/** Private IP ranges and known metadata endpoints to block (SSRF mitigation). */
const BLOCKED_HOSTNAMES = new Set([
	"169.254.169.254",
	"metadata.google.internal",
	"169.254.170.2",
	"fd00:ec2::254",
]);

export function isBlockedImportUrl(rawUrl: string): boolean {
	try {
		const { hostname } = new URL(rawUrl);
		const host = hostname.toLowerCase().replace(/\.$/, "");
		if (BLOCKED_HOSTNAMES.has(host)) return true;
		if (host === "localhost" || host.endsWith(".localhost")) return true;
		if (host === "0.0.0.0") return true;

		// IPv6 loopback / ULA / link-local
		if (host === "::1" || host === "[::1]") return true;
		const bare =
			host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
		if (bare.includes(":")) {
			const h = bare.toLowerCase();
			if (
				h === "::1" ||
				h.startsWith("fc") ||
				h.startsWith("fd") ||
				h.startsWith("fe80:")
			) {
				return true;
			}
		}

		const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
		if (ipv4) {
			const a = Number(ipv4[1]);
			const b = Number(ipv4[2]);
			if (a === 10) return true;
			if (a === 172 && b >= 16 && b <= 31) return true;
			if (a === 192 && b === 168) return true;
			if (a === 127) return true;
			if (a === 169 && b === 254) return true; // link-local
			if (a === 0) return true;
		}
		return false;
	} catch {
		return false;
	}
}

export interface SubmitRecipeImportInput {
	userId: string;
	organizationId: string;
	url: string;
	/** Client-assisted page HTML (stored in R2; not sent on the queue). */
	pageHtml?: string;
	flagContext: FlagshipEvaluationContext;
}

export type SubmitRecipeImportResult =
	| { status: "processing"; requestId: string }
	| {
			success: false;
			code: "DUPLICATE_URL";
			existingMealId: string;
			existingMealName: string;
			error: string;
	  };

export async function submitRecipeImport(
	env: Cloudflare.Env,
	input: SubmitRecipeImportInput,
): Promise<SubmitRecipeImportResult> {
	const {
		userId,
		organizationId,
		url: validatedUrl,
		pageHtml,
		flagContext,
	} = input;

	await assertFeatureEnabled(env, "ai-import-url", flagContext);

	if (isBlockedImportUrl(validatedUrl)) {
		throw data({ error: "That URL is not accessible." }, { status: 422 });
	}

	if (pageHtml && utf8ByteLength(pageHtml) > RECIPE_IMPORT_PAGE_HTML_MAX) {
		throw data({ error: "Page HTML is too large to process" }, { status: 400 });
	}

	try {
		const db = drizzle(env.DB);
		const duplicates = await db
			.select({ id: meal.id, name: meal.name })
			.from(meal)
			.where(
				and(
					eq(meal.organizationId, organizationId),
					sql`json_extract(${meal.customFields}, '$.sourceUrl') = ${validatedUrl}`,
				),
			)
			.limit(1);

		if (duplicates.length > 0 && duplicates[0]) {
			const dup = duplicates[0];
			return {
				success: false,
				code: "DUPLICATE_URL",
				existingMealId: dup.id,
				existingMealName: dup.name,
				error: `This URL has already been imported as "${dup.name}".`,
			};
		}
	} catch (dedupErr) {
		log.error("Dedup check failed", dedupErr);
	}

	const queue = env.IMPORT_URL_QUEUE;
	if (!queue) {
		throw data({ error: "Import service unavailable" }, { status: 503 });
	}

	return withCreditGate(
		{
			env,
			organizationId,
			userId,
			cost: AI_COSTS.IMPORT_URL,
			reason: "Import URL",
		},
		async () => {
			const requestId = crypto.randomUUID();
			await insertQueueJobPending(
				env.DB,
				requestId,
				"import_url",
				organizationId,
			);

			const useClientHtml = Boolean(pageHtml?.trim());
			if (useClientHtml && pageHtml) {
				// R2 for strong read-after-write (KV is eventually consistent across colos).
				await env.STORAGE.put(importPageR2Key(requestId), pageHtml, {
					httpMetadata: { contentType: "text/html; charset=utf-8" },
				});
			}

			await queue.send({
				requestId,
				organizationId,
				userId,
				url: validatedUrl,
				cost: AI_COSTS.IMPORT_URL,
				...(useClientHtml ? { contentSource: "client" as const } : {}),
			});
			return { status: "processing" as const, requestId };
		},
	);
}

export function mapRecipeImportSubmitError(outerError: unknown): void {
	if (outerError instanceof InsufficientCreditsError) {
		throw data(
			{
				error: "Insufficient credits",
				required: outerError.required,
				...(typeof outerError.current === "number"
					? { current: outerError.current }
					: {}),
			},
			{ status: 402 },
		);
	}
}
