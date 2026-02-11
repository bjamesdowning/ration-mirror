export function redactId(value: string | null | undefined, visible = 4) {
	if (!value) return "redacted";
	if (value.length <= visible * 2) return "redacted";
	return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

export function redactEmail(value: string | null | undefined) {
	if (!value) return "redacted";
	const [local, domain] = value.split("@");
	if (!domain || !local) return "redacted";
	const safeLocal = local.length > 2 ? `${local[0]}***${local.at(-1)}` : "***";
	return `${safeLocal}@${domain}`;
}

/**
 * Safe serialization for Error instances (avoids logging full object which may contain PII).
 */
function safeErrorDetail(error: unknown): string {
	if (error instanceof Error) {
		const stack = error.stack ? `\n${error.stack}` : "";
		return `${error.message}${stack}`;
	}
	return String(error);
}

/**
 * Structured logging for server-side code. Use instead of console.log/warn/error
 * for consistency and future extensibility (e.g. log aggregation).
 * For error/critical, only message and stack are logged for Error instances to avoid PII.
 */
export const log = {
	info(message: string, context?: Record<string, unknown>) {
		const payload = context ? `${message} ${JSON.stringify(context)}` : message;
		console.info(`[INFO] ${payload}`);
	},
	warn(message: string, context?: Record<string, unknown>) {
		const payload = context ? `${message} ${JSON.stringify(context)}` : message;
		console.warn(`[WARN] ${payload}`);
	},
	error(message: string, error?: unknown, context?: Record<string, unknown>) {
		const ctx = context ? ` ${JSON.stringify(context)}` : "";
		const detail =
			error !== undefined && error !== null ? safeErrorDetail(error) : "";
		console.error(`[ERROR] ${message}${ctx}${detail ? ` ${detail}` : ""}`);
	},
	critical(
		message: string,
		error?: unknown,
		context?: Record<string, unknown>,
	) {
		const ctx = context ? ` ${JSON.stringify(context)}` : "";
		const detail =
			error !== undefined && error !== null ? safeErrorDetail(error) : "";
		console.error(`[CRITICAL] ${message}${ctx}${detail ? ` ${detail}` : ""}`);
	},
	debug(message: string, context?: Record<string, unknown>) {
		const payload = context ? `${message} ${JSON.stringify(context)}` : message;
		console.info(`[DEBUG] ${payload}`);
	},
};
