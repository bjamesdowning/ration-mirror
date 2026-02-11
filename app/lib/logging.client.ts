/**
 * Client-side structured logging. Use instead of console.log/warn/error
 * for consistency. Logs only in development (import.meta.env.DEV).
 */
const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV;

function safeErrorDetail(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export const log = {
	info(message: string, context?: Record<string, unknown>) {
		if (!isDev) return;
		const payload = context ? `${message} ${JSON.stringify(context)}` : message;
		console.info(`[INFO] ${payload}`);
	},
	warn(message: string, context?: Record<string, unknown>) {
		if (!isDev) return;
		const payload = context ? `${message} ${JSON.stringify(context)}` : message;
		console.warn(`[WARN] ${payload}`);
	},
	error(message: string, error?: unknown, context?: Record<string, unknown>) {
		if (!isDev) return;
		const ctx = context ? ` ${JSON.stringify(context)}` : "";
		const detail =
			error !== undefined && error !== null ? safeErrorDetail(error) : "";
		console.error(`[ERROR] ${message}${ctx}${detail ? ` ${detail}` : ""}`);
	},
	debug(message: string, context?: Record<string, unknown>) {
		if (!isDev) return;
		const payload = context ? `${message} ${JSON.stringify(context)}` : message;
		console.info(`[DEBUG] ${payload}`);
	},
};
