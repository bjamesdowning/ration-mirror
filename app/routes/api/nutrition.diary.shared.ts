import type { AppLoadContext } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { requireMobileActiveGroup } from "~/lib/mobile/auth.server";
import { beginDiaryRequest } from "~/lib/nutrition/diary-http.server";

type DiaryArgs = {
	request: Request;
	context: AppLoadContext;
};

/**
 * Web cookie sessions use requireActiveGroup. A mobile Bearer token is not a
 * cookie: requireActiveGroup redirects to HTML, URLSession follows it, and the
 * app reports "Unexpected response from server."
 */
export async function resolveDiaryAuth(
	args: DiaryArgs,
): Promise<{ groupId: string; userId: string }> {
	if (args.request.headers.get("Authorization")?.startsWith("Bearer ") === true) {
		const mobile = await requireMobileActiveGroup(args.context, args.request);
		return { groupId: mobile.organizationId, userId: mobile.userId };
	}
	const { groupId, session } = await requireActiveGroup(
		args.context,
		args.request,
	);
	return { groupId, userId: session.user.id };
}

export async function withDiary(
	args: DiaryArgs,
	surface: "web" | "mobile",
	bucket: "settings_mutation" | "api_export" | "scan" | "barcode_lookup",
	run: (
		started: Awaited<ReturnType<typeof beginDiaryRequest>>,
	) => Promise<unknown>,
) {
	try {
		const auth = await resolveDiaryAuth(args);
		const started = await beginDiaryRequest(
			args.request,
			args.context,
			auth,
			surface,
			bucket,
		);
		return await run(started);
	} catch (error) {
		if (error instanceof Response) throw error;
		return handleApiError(error);
	}
}

export function methodNotAllowed(): never {
	throw new Response(JSON.stringify({ error: "Method not allowed" }), {
		status: 405,
		headers: { "Content-Type": "application/json" },
	});
}
