import { parseRationClientHeader } from "~/lib/feature-flags/context.server";

/** Client version and locale recorded with mobile consent and feature-enablement changes. */
export function mobileConsentMetadata(request: Request): {
	clientVersion: string | null;
	locale: string | null;
} {
	return {
		clientVersion:
			parseRationClientHeader(request.headers.get("X-Ration-Client"))
				.clientVersion ?? null,
		locale:
			request.headers
				.get("Accept-Language")
				?.split(",")[0]
				?.trim()
				.slice(0, 35) || null,
	};
}
