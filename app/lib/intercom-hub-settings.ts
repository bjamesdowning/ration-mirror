/** DOM id for the hub header control Intercom binds via `custom_launcher_selector`. */
export const RATION_INTERCOM_LAUNCHER_ID = "ration-intercom-launcher";

export const RATION_INTERCOM_LAUNCHER_SELECTOR = `#${RATION_INTERCOM_LAUNCHER_ID}`;

/** Messenger attributes: hide floating bubble and open from our header button instead. */
export function withHubIntercomLauncher<T extends Record<string, unknown>>(
	base: T,
): T & { hide_default_launcher: true; custom_launcher_selector: string } {
	return {
		...base,
		hide_default_launcher: true,
		custom_launcher_selector: RATION_INTERCOM_LAUNCHER_SELECTOR,
	};
}
