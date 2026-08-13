/**
 * First-party Copilot inherits the Ask client's Flagship identity.
 * Auth source is trusted (Bearer = iOS); web cannot spoof ios via X-Ration-Client.
 */

import {
	type AgentOriginatingClient,
	parseRationClientHeader,
} from "../feature-flags/context.server";
import { APP_VERSION } from "../version";
import type { CopilotAuthSource } from "./auth.server";

export type CopilotOriginatingClient = AgentOriginatingClient;

export function inferCopilotAuthSource(request: Request): CopilotAuthSource {
	const header = request.headers.get("Authorization");
	if (header?.startsWith("Bearer ") && header.slice(7).trim().length > 0) {
		return "mobile";
	}
	return "web";
}

/**
 * Web Ask always evaluates as `web` + APP_VERSION.
 * iOS Ask evaluates as `ios` + marketing version from `X-Ration-Client`.
 */
export function resolveCopilotOriginatingClient(
	request: Request,
	authSource: CopilotAuthSource = inferCopilotAuthSource(request),
): CopilotOriginatingClient {
	if (authSource === "web") {
		return { clientPlatform: "web", clientVersion: APP_VERSION };
	}
	const reported = parseRationClientHeader(
		request.headers.get("X-Ration-Client"),
	);
	const version =
		reported.clientPlatform === "ios" || reported.clientPlatform === "mobile"
			? reported.clientVersion
			: undefined;
	return {
		clientPlatform: "ios",
		...(version ? { clientVersion: version } : {}),
	};
}
