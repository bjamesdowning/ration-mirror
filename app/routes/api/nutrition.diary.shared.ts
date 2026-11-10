import type { AppLoadContext } from "react-router";
import { requireActiveGroup } from "~/lib/auth.server";
import { handleApiError } from "~/lib/error-handler";
import { beginDiaryRequest } from "~/lib/nutrition/diary-http.server";

type DiaryArgs = {
	request: Request;
	context: AppLoadContext;
};

export async function withDiary(
	args: DiaryArgs,
	surface: "web" | "mobile",
	bucket: "settings_mutation" | "api_export" | "scan" | "barcode_lookup",
	run: (
		started: Awaited<ReturnType<typeof beginDiaryRequest>>,
	) => Promise<unknown>,
) {
	try {
		const { groupId, session } = await requireActiveGroup(
			args.context,
			args.request,
		);
		const started = await beginDiaryRequest(
			args.request,
			args.context,
			{ groupId, userId: session.user.id },
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
