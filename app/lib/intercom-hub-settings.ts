/** DOM id for the hub header control (stable anchor; Intercom binds via class selector below). */
export const RATION_INTERCOM_LAUNCHER_ID = "ration-intercom-launcher";

/** Shared class: Intercom `custom_launcher_selector` targets all launchers (header + Help page, etc.). */
export const RATION_INTERCOM_LAUNCHER_CLASS = "ration-intercom-launcher";

export const RATION_INTERCOM_LAUNCHER_SELECTOR = `.${RATION_INTERCOM_LAUNCHER_CLASS}`;

/** Messenger attributes: hide floating bubble and open from custom launcher elements. */
export function withHubIntercomLauncher<T extends Record<string, unknown>>(
	base: T,
): T & { hide_default_launcher: true; custom_launcher_selector: string } {
	return {
		...base,
		hide_default_launcher: true,
		custom_launcher_selector: RATION_INTERCOM_LAUNCHER_SELECTOR,
	};
}
