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
				"rounded-lg px-2.5 md:px-3.5 text-sm font-semibold whitespace-nowrap transition-colors",
				"border border-hyper-green/80 bg-hyper-green text-carbon shadow-sm",
				"hover:border-hyper-green hover:bg-hyper-green/90 hover:brightness-[1.02]",
				"active:bg-hyper-green/85",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hyper-green focus-visible:ring-offset-2 focus-visible:ring-offset-ceramic",
				"dark:border-hyper-green dark:bg-hyper-green dark:text-carbon",
				"dark:hover:bg-hyper-green/90 dark:hover:brightness-[1.03]",
				"dark:focus-visible:ring-offset-carbon",
				hasUnread
					? "shadow-[0_0_0_2px_rgba(0,224,136,0.45),0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-carbon/10 dark:ring-white/20"
					: "",
			].join(" ")}
			aria-label={ariaLabel}
		>
			<MessageCircle className="size-4 shrink-0 text-carbon" aria-hidden />
			<span className="hidden md:inline" aria-hidden>
				Ask Ration
			</span>
			<span className="md:hidden" aria-hidden>
				Ask
			</span>
			{hasUnread ? (
				<span
					className="absolute top-1.5 right-1.5 size-2 rounded-full bg-carbon ring-2 ring-white dark:bg-white dark:ring-carbon pointer-events-none"
					aria-hidden
				/>
			) : null}
		</button>
	);
}
