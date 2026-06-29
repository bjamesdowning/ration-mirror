export const BILLING_ERROR_CODES = {
	ACTIVE_APP_STORE_SUB: "active_app_store_subscription",
	BILLING_UNAVAILABLE: "billing_unavailable",
} as const;

export type BillingErrorCode =
	(typeof BILLING_ERROR_CODES)[keyof typeof BILLING_ERROR_CODES];
