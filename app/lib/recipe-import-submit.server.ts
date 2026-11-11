import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { data } from "react-router";
import { meal } from "~/db/schema";
import { assertFeatureEnabled } from "~/lib/feature-flags/assert-enabled.server";
import type { FlagshipEvaluationContext } from "~/lib/feature-flags/flags.server";
import {
	classifyImportUrl,
	type ImportSourceKind,
	laneFlagForSource,
} from "~/lib/import/classify-import-url";
import { submitDurableRecipeImport } from "~/lib/import-dispatch.server";
import { InsufficientCreditsError } from "~/lib/ledger.server";
import { log } from "~/lib/logging.server";
import { utf8ByteLength } from "~/lib/recipe-import-block.server";
import {
	RECIPE_IMPORT_PAGE_HTML_MAX,
	RECIPE_IMPORT_PHOTO_MAX_BYTES,
	type RecipeImportRequest,
} from "~/lib/schemas/recipe-import";

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
	url?: string;
	/** Client-assisted page HTML (stored in R2; not sent on the queue). */
	pageHtml?: string;
	userText?: string;
	photoBase64?: string;
	photoMimeType?: RecipeImportRequest["photoMimeType"];
	clientRequestId?: string;
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

function decodeBase64Photo(base64: string): ArrayBuffer {
	const binary = atob(base64.replace(/\s/g, ""));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

export async function submitRecipeImport(
	env: Cloudflare.Env,
	input: SubmitRecipeImportInput,
): Promise<SubmitRecipeImportResult> {
	const {
		userId,
		organizationId,
		url,
		pageHtml,
		userText,
		photoBase64,
		photoMimeType,
		clientRequestId,
		flagContext,
	} = input;

	await assertFeatureEnabled(env, "ai-import-url", flagContext);

	const hasPhoto = Boolean(photoBase64?.trim());
	const sourceKind: ImportSourceKind = hasPhoto
		? "photo"
		: classifyImportUrl(url ?? "");

	await assertFeatureEnabled(env, laneFlagForSource(sourceKind), flagContext);

	const validatedUrl = url?.trim() ?? "";
	if (!hasPhoto) {
		if (!validatedUrl) {
			throw data({ error: "Provide a recipe URL or a photo" }, { status: 400 });
		}
		if (isBlockedImportUrl(validatedUrl)) {
			throw data({ error: "That URL is not accessible." }, { status: 422 });
		}
	} else if (validatedUrl && isBlockedImportUrl(validatedUrl)) {
		throw data({ error: "That URL is not accessible." }, { status: 422 });
	}

	if (pageHtml && utf8ByteLength(pageHtml) > RECIPE_IMPORT_PAGE_HTML_MAX) {
		throw data({ error: "Page HTML is too large to process" }, { status: 400 });
	}

	if (hasPhoto && photoBase64) {
		try {
			const buf = decodeBase64Photo(photoBase64);
			if (buf.byteLength > RECIPE_IMPORT_PHOTO_MAX_BYTES) {
				throw data({ error: "Photo is too large (Max 3MB)" }, { status: 400 });
			}
		} catch (err) {
			if (err && typeof err === "object" && "type" in err) throw err;
			throw data({ error: "Invalid photo data" }, { status: 400 });
		}
	}

	if (validatedUrl) {
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
	}

	const queue = env.IMPORT_URL_QUEUE;
	if (!queue) {
		throw data({ error: "Import service unavailable" }, { status: 503 });
	}

	return submitDurableRecipeImport(env, {
		userId,
		organizationId,
		clientRequestId,
		url: validatedUrl || (hasPhoto ? "" : validatedUrl),
		userText,
		pageHtml,
		photoBase64,
		photoMimeType,
		sourceKind,
		hasPhoto,
	});
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
