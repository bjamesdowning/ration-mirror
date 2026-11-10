/** Fuel cap and photo errors. Bodies stay free of food names. */

export const FUEL_DAILY_LIMIT = 3;

export class FuelDailyLimitError extends Error {
	readonly code = "fuel_daily_limit" as const;
	readonly status = 403;
	readonly upgradeRequired = true;
	readonly limit = FUEL_DAILY_LIMIT;

	constructor(
		readonly used: number,
		readonly localDate: string,
	) {
		super("Daily fuel log limit reached");
		this.name = "FuelDailyLimitError";
	}
}

export class FuelTimezoneRequiredError extends Error {
	readonly code = "fuel_timezone_required" as const;
	readonly status = 400;

	constructor() {
		super("Set a time zone on Fuel before logging");
		this.name = "FuelTimezoneRequiredError";
	}
}

export class FuelDateImmutableError extends Error {
	readonly code = "fuel_date_immutable" as const;
	readonly status = 400;

	constructor() {
		super("A logged meal stays on its original day");
		this.name = "FuelDateImmutableError";
	}
}

export class FuelPhotoTypeError extends Error {
	readonly code = "photo_type" as const;
	readonly status = 415;

	constructor() {
		super("Use a JPEG, PNG, or WebP photo");
		this.name = "FuelPhotoTypeError";
	}
}

export class FuelPhotoTooLargeError extends Error {
	readonly code = "photo_too_large" as const;
	readonly status = 400;

	constructor() {
		super("Photo must be 3 MiB or smaller");
		this.name = "FuelPhotoTooLargeError";
	}
}
