import { getLogContext } from "./ops-context.server";

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

function compactRecord(
	record: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (value === undefined) continue;
		out[key] = value;
	}
	return out;
}

type LogLevel = "info" | "warn" | "error" | "critical" | "debug";

function isPlainContextObject(
	value: unknown,
): value is Record<string, unknown> {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		!(value instanceof Error)
	);
}

/**
 * Emit a JSON object so Workers Logs indexes fields (level, msg, event, cfRay).
 * Do not stringify into a message — string logs are only text-searchable.
 */
function emit(
	level: LogLevel,
	message: string,
	context?: Record<string, unknown>,
	error?: unknown,
): void {
	const payload = compactRecord({
		level,
		msg: message,
		...getLogContext(),
		...context,
		...(error !== undefined && error !== null
			? { err: safeErrorDetail(error) }
			: {}),
	});

	if (level === "error" || level === "critical") {
		console.error(payload);
		return;
	}
	if (level === "warn") {
		console.warn(payload);
		return;
	}
	console.info(payload);
}

/**
 * Structured logging for server-side code. Use instead of console.log/warn/error
 * so Workers Logs can filter on indexed fields.
 * For error/critical, only message and stack are logged for Error instances to avoid PII.
 */
export const log = {
	info(message: string, context?: Record<string, unknown>) {
		emit("info", message, context);
	},
	warn(message: string, context?: Record<string, unknown>) {
		emit("warn", message, context);
	},
	error(message: string, error?: unknown, context?: Record<string, unknown>) {
		if (context === undefined && isPlainContextObject(error)) {
			emit("error", message, error);
			return;
		}
		emit("error", message, context, error);
	},
	critical(
		message: string,
		error?: unknown,
		context?: Record<string, unknown>,
	) {
		if (context === undefined && isPlainContextObject(error)) {
			emit("critical", message, error);
			return;
		}
		emit("critical", message, context, error);
	},
	debug(message: string, context?: Record<string, unknown>) {
		emit("debug", message, context);
	},
};

/** Redact a queue job UUID for log context. Never pass the raw id. */
export function redactJobRequestId(body: unknown): string | undefined {
	if (!body || typeof body !== "object" || !("requestId" in body)) {
		return undefined;
	}
	const id = (body as { requestId: unknown }).requestId;
	if (typeof id !== "string" || id.length === 0) return undefined;
	return redactId(id);
}
