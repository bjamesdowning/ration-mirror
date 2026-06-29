import { z } from "zod";
import { ALLERGEN_SLUGS } from "~/lib/allergens";

export const MobileMagicLinkSchema = z.object({
	email: z.string().email(),
});

export const MobileTokenRequestSchema = z.discriminatedUnion("grantType", [
	z.object({
		grantType: z.literal("authorization_code"),
		code: z.string().min(1),
	}),
	z.object({
		grantType: z.literal("refresh_token"),
		refreshToken: z.string().min(1),
	}),
]);

export const MobileActivateOrgSchema = z.object({
	organizationId: z.string().min(1),
});

export const MobileSettingsPatchSchema = z
	.object({
		theme: z.enum(["light", "dark"]).optional(),
		supplyUnitMode: z.enum(["cooking", "metric", "imperial"]).optional(),
		allergens: z.array(z.enum(ALLERGEN_SLUGS)).optional(),
	})
	.refine((v) => Object.keys(v).length > 0, {
		message: "At least one setting is required",
	});
