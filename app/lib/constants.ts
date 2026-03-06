/**
 * Shared constants used by both server and client.
 * Keep in sync with any server-side enforcement (e.g. galley.server, csv-parser).
 */

/** Max meals per galley import. Enforced in applyGalleyImport; UI uses for truncation warnings. */
export const MAX_MEALS_IMPORT = 100;
