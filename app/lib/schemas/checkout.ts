import { z } from "zod";
import { CREDIT_PACKS, SUBSCRIPTION_PRODUCTS } from "~/lib/stripe.server";

const CREDIT_PACK_KEYS = Object.keys(CREDIT_PACKS) as [
	keyof typeof CREDIT_PACKS,
	...(keyof typeof CREDIT_PACKS)[],
];
const SUBSCRIPTION_KEYS = Object.keys(SUBSCRIPTION_PRODUCTS) as [
	keyof typeof SUBSCRIPTION_PRODUCTS,
	...(keyof typeof SUBSCRIPTION_PRODUCTS)[],
];

export const CheckoutFormSchema = z
	.object({
		type: z.enum(["credits", "subscription", "tier"]).default("credits"),
		pack: z.enum(CREDIT_PACK_KEYS).optional(),
		subscription: z.enum(SUBSCRIPTION_KEYS).optional(),
		currency: z.enum(["USD", "EUR"]).optional().default("EUR"),
		returnUrl: z
			.string()
			.min(1)
			.refine((p) => p.startsWith("/hub"), {
				message: "Return URL must start with /hub",
			})
			.default("/hub/checkout/return"),
	})
	.superRefine((data, ctx) => {
		if (data.type === "credits" && !data.pack) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Pack is required for credit checkout",
				path: ["pack"],
			});
		}
		if (
			(data.type === "subscription" || data.type === "tier") &&
			!data.subscription
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Subscription is required for subscription checkout",
				path: ["subscription"],
			});
		}
	});

export type CheckoutFormInput = z.infer<typeof CheckoutFormSchema>;
