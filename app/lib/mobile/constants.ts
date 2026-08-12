export const MOBILE_JWT_AUDIENCE = "ration-mobile";
export const MOBILE_ACCESS_TTL_SEC = 15 * 60;
export const MOBILE_REFRESH_TTL_SEC = 90 * 24 * 60 * 60;
export const MOBILE_AUTH_CODE_TTL_SEC = 300;
/** @deprecated Auth codes live in D1; kept for any leftover KV cleanup. */
export const MOBILE_AUTH_CODE_KV_PREFIX = "mobile:auth:code:";
/** Short window so a lost refresh response can be retried with the same token. */
export const MOBILE_REFRESH_GRACE_TTL_SEC = 30;
export const MOBILE_REFRESH_GRACE_KV_PREFIX = "mobile:refresh:grace:";
export const MOBILE_PENDING_HANDOFF_TTL_SEC = 600;
export const MOBILE_PENDING_HANDOFF_KV_PREFIX = "mobile:pending:";
export const MOBILE_DEFAULT_CARGO_PAGE_SIZE = 50;
