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
