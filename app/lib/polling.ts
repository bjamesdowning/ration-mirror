/**
 * Shared constants for AI queue status polling.
 * Used by scan, meal-generate, plan-week, and import-URL features.
 */
export const POLL_INTERVAL_MS = 1500;
export const MAX_POLL_ATTEMPTS = 80; // ~120s max wait for AI processing
