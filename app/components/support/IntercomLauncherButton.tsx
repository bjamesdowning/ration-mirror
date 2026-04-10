import { MessageCircle } from "lucide-react";
import { useRouteLoaderData } from "react-router";
import { RATION_INTERCOM_LAUNCHER_ID } from "~/lib/intercom-hub-settings";
import { useIntercomLauncher } from "~/lib/intercom-launcher-context";

type RootLoaderSlice = {
	user?: { id: string } | null;
	intercomAppId: string | null;
};

/**
 * Header trigger for Intercom / Fin. Intercom attaches `custom_launcher_selector` to this
 * element; do not replace with a plain div without updating `HubIntercom` boot settings.
 */
export function IntercomLauncherButton() {
	const root = useRouteLoaderData("root") as RootLoaderSlice | undefined;
	const { hasUnread } = useIntercomLauncher();

	if (!root?.user?.id || !root.intercomAppId) {
		return null;
	}

	return (
		<button
			type="button"
			id={RATION_INTERCOM_LAUNCHER_ID}
			className="relative flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg transition-colors text-muted hover:text-carbon hover:bg-platinum/60"
			aria-label={
				hasUnread
					? "Support and chat, you have unread messages"
					: "Support and chat"
			}
		>
			<MessageCircle className="w-4 h-4" aria-hidden />
			{hasUnread ? (
				<span
					className="absolute top-2 right-2 w-2 h-2 rounded-full bg-hyper-green pointer-events-none"
					aria-hidden
				/>
			) : null}
		</button>
	);
}
