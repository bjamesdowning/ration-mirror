import { MessageCircle } from "lucide-react";
import { useRouteLoaderData } from "react-router";
import { RATION_INTERCOM_LAUNCHER_ID } from "~/lib/intercom-hub-settings";
import { intercomLauncherButtonAriaLabel } from "~/lib/intercom-launcher-aria";
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

	const ariaLabel = intercomLauncherButtonAriaLabel(hasUnread);

	return (
		<button
			type="button"
			id={RATION_INTERCOM_LAUNCHER_ID}
			className={[
				"group relative inline-flex min-h-[44px] max-w-[11rem] shrink-0 items-center justify-center gap-1.5",
				"rounded-full border px-2.5 md:px-3 text-sm font-medium whitespace-nowrap transition-colors",
				"border-hyper-green/45 bg-hyper-green/15 text-carbon",
				"hover:border-hyper-green/70 hover:bg-hyper-green/25",
				"active:bg-hyper-green/30",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hyper-green focus-visible:ring-offset-2 focus-visible:ring-offset-ceramic",
				"dark:border-hyper-green/50 dark:bg-hyper-green/20 dark:text-ceramic",
				"dark:hover:border-hyper-green dark:hover:bg-hyper-green/30",
				"dark:focus-visible:ring-offset-carbon",
				hasUnread
					? "border-hyper-green/70 bg-hyper-green/25 shadow-[0_0_0_1px_rgba(0,224,136,0.35)] dark:border-hyper-green dark:bg-hyper-green/35"
					: "",
			].join(" ")}
			aria-label={ariaLabel}
		>
			<MessageCircle className="size-4 shrink-0 text-hyper-green" aria-hidden />
			<span className="hidden md:inline" aria-hidden>
				Ask Ration
			</span>
			<span className="md:hidden" aria-hidden>
				Ask
			</span>
			{hasUnread ? (
				<span
					className="absolute top-1 right-1 size-2 rounded-full bg-hyper-green ring-2 ring-ceramic dark:ring-carbon pointer-events-none"
					aria-hidden
				/>
			) : null}
		</button>
	);
}
