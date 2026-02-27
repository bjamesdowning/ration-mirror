import { log, redactId } from "./logging.server";

export const SUPPLY_SYNC_TELEMETRY_SCHEMA = "ration.supply_sync.v1";

export type SupplySyncTrigger =
	| "dashboard_grocery_action_update_list"
	| "dashboard_grocery_background_sync";

export interface SupplySyncTelemetryContext {
	requestId?: string;
	trigger: SupplySyncTrigger;
	organizationId?: string;
	listId?: string;
}

function toErrorFields(error: unknown) {
	if (error instanceof Error) {
		return {
			error_name: error.name,
			error_message: error.message,
		};
	}

	return {
		error_name: "UnknownError",
		error_message: String(error),
	};
}

function buildBasePayload(
	eventName: string,
	context: SupplySyncTelemetryContext,
) {
	return {
		telemetry_schema: SUPPLY_SYNC_TELEMETRY_SCHEMA,
		event_name: eventName,
		ts_ms: Date.now(),
		request_id: context.requestId ?? "unknown",
		trigger: context.trigger,
		organization_ref: redactId(context.organizationId),
		list_ref: redactId(context.listId),
	};
}

export function emitSupplySyncInfo(
	eventName: string,
	context: SupplySyncTelemetryContext,
	fields?: Record<string, unknown>,
) {
	log.info("[Telemetry] supply_sync", {
		...buildBasePayload(eventName, context),
		...fields,
	});
}

export function emitSupplySyncError(
	eventName: string,
	context: SupplySyncTelemetryContext,
	error: unknown,
	fields?: Record<string, unknown>,
) {
	log.error("[Telemetry] supply_sync", undefined, {
		...buildBasePayload(eventName, context),
		...toErrorFields(error),
		...fields,
	});
}

// ---------------------------------------------------------------------------
// D1 Batch Size Telemetry
// ---------------------------------------------------------------------------

const D1_BATCH_STATEMENT_LIMIT = 100;

/**
 * Logs a D1 batch's statement count so we can alert when batches approach
 * the undocumented ~100-statement limit. Call this before `d1.batch()` on
 * any write-heavy path (createMeal, cookMeal, ingestCargoItems).
 *
 * Emits a warning when statementCount > 75% of limit to give early notice.
 */
export function trackD1BatchSize(
	operation: string,
	statementCount: number,
	context?: { organizationRef?: string },
): void {
	const utilization = statementCount / D1_BATCH_STATEMENT_LIMIT;

	if (utilization >= 0.75) {
		log.warn("[Telemetry] d1_batch_size_warning", {
			operation,
			statement_count: statementCount,
			limit: D1_BATCH_STATEMENT_LIMIT,
			utilization_pct: Math.round(utilization * 100),
			organization_ref: redactId(context?.organizationRef),
		});
	} else {
		log.info("[Telemetry] d1_batch_size", {
			operation,
			statement_count: statementCount,
			limit: D1_BATCH_STATEMENT_LIMIT,
			organization_ref: redactId(context?.organizationRef),
		});
	}
}

// ---------------------------------------------------------------------------
// Write Path Timing
// ---------------------------------------------------------------------------

/**
 * Wraps a write operation with timing telemetry, logging duration and
 * providing visibility into slow D1 writes under contention.
 */
export async function trackWriteOperation<T>(
	operation: string,
	fn: () => Promise<T>,
	context?: { organizationRef?: string },
): Promise<T> {
	const startMs = Date.now();
	try {
		const result = await fn();
		const durationMs = Date.now() - startMs;
		log.info("[Telemetry] write_op_complete", {
			operation,
			duration_ms: durationMs,
			organization_ref: redactId(context?.organizationRef),
		});
		return result;
	} catch (err) {
		const durationMs = Date.now() - startMs;
		log.error("[Telemetry] write_op_failed", err, {
			operation,
			duration_ms: durationMs,
			organization_ref: redactId(context?.organizationRef),
		});
		throw err;
	}
}
