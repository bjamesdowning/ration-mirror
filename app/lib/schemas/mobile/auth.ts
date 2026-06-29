import { z } from "zod";
import { ALLERGEN_SLUGS } from "~/lib/allergens";
import {
	PKCE_CHALLENGE_REGEX,
	PKCE_MAX_LENGTH,
	PKCE_MIN_LENGTH,
} from "~/lib/mobile/pkce";
import { HubLayoutSchema } from "~/lib/schemas/hub";

/** RFC 7636 base64url verifier: 43–128 unreserved characters. */
const PkceCodeChallenge = z.string().regex(PKCE_CHALLENGE_REGEX);
const PkceCodeVerifier = z
	.string()
	.min(PKCE_MIN_LENGTH)
	.max(PKCE_MAX_LENGTH)
	.regex(PKCE_CHALLENGE_REGEX);

export const MobileMagicLinkSchema = z.object({
	email: z.string().email(),
	// S256 PKCE challenge; the app proves the matching verifier at token exchange.
	codeChallenge: PkceCodeChallenge,
});

export const MobileTokenRequestSchema = z.discriminatedUnion("grantType", [
	z.object({
		grantType: z.literal("authorization_code"),
		code: z.string().min(1),
		codeVerifier: PkceCodeVerifier,
	}),
	z.object({
		grantType: z.literal("refresh_token"),
		refreshToken: z.string().min(1),
	}),
]);

export const MobileActivateOrgSchema = z.object({
	organizationId: z.string().min(1),
});

const isoTimestamp = z.string().datetime({ offset: true });

export const MobileSettingsPatchSchema = z
	.object({
		theme: z.enum(["light", "dark"]).optional(),
		supplyUnitMode: z.enum(["cooking", "metric", "imperial"]).optional(),
		allergens: z.array(z.enum(ALLERGEN_SLUGS)).optional(),
		/** ISO timestamp when the user consented to AI/receipt processing. */
		aiConsentAt: isoTimestamp.optional(),
		onboardingCompletedAt: isoTimestamp.optional(),
		onboardingStep: z.coerce.number().int().min(0).max(6).optional(),
		expirationAlertDays: z.coerce.number().int().min(1).max(90).optional(),
		hubProfile: z
			.enum(["cook", "shop", "minimal", "full", "custom"])
			.optional(),
		hubLayout: HubLayoutSchema.optional(),
	})
	.refine((v) => Object.keys(v).length > 0, {
		message: "At least one setting is required",
	});
