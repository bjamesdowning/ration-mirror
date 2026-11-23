import { FUEL_DAILY_LIMIT } from "~/lib/nutrition/fuel-errors";

/** Bullet on every Crew feature list. */
export const UNLIMITED_FUEL_LOGS = "Unlimited Fuel logs";

/** Free vs Crew table row. Free is 3 per day. The Crew cell is Unlimited. */
export const FUEL_LOGS_ROW_LABEL = "Fuel logs per day";

/** Free cell. The server gate is the 4th log, so Free is this many. */
export const FREE_FUEL_LOGS_LABEL = String(FUEL_DAILY_LIMIT);

export const CREW_FUEL_LOGS_LABEL = "Unlimited";
