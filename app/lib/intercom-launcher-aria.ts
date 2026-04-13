/** Accessible name for the hub Intercom launcher (full phrase; visible label may shorten on small screens). */
export function intercomLauncherButtonAriaLabel(hasUnread: boolean): string {
	if (hasUnread) {
		return "Ask Ration (support chat), you have unread messages";
	}
	return "Ask Ration (support chat)";
}
