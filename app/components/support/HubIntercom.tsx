import { useEffect } from "react";
import { useRouteLoaderData } from "react-router";
import { withHubIntercomLauncher } from "~/lib/intercom-hub-settings";
import { useIntercomLauncher } from "~/lib/intercom-launcher-context";
import { toUnixSeconds } from "~/lib/intercom-utils";

/** Subset of root loader fields used by HubIntercom (avoids importing the root route module). */
type RootLoaderSlice = {
	user?: {
		id: string;
		email: string;
		name: string;
		createdAt: unknown;
	} | null;
	intercomAppId: string | null;
	intercomUserHash: string | null;
	activeOrganizationId: string | null;
};

export type HubIntercomContext = {
	tier: string;
	isTierExpired: boolean;
	balance: number;
};

type HubIntercomProps = {
	user: NonNullable<RootLoaderSlice["user"]>;
	intercomAppId: string;
	intercomUserHash: string | null;
	activeOrganizationId: string | null;
	hub: HubIntercomContext;
};

/**
 * Loads Intercom only while the hub layout is mounted (`/hub/*`).
 * Uses a header-bound custom launcher so the default bubble does not cover mobile Supply.
 * Calls `shutdown` on unmount to avoid leaking identity on shared devices.
 */
export function HubIntercom({
	user,
	intercomAppId,
	intercomUserHash,
	activeOrganizationId,
	hub,
}: HubIntercomProps) {
	const { setHasUnread, resetUnread } = useIntercomLauncher();

	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			const {
				default: initIntercom,
				onUnreadCountChange,
				shutdown,
			} = await import("@intercom/messenger-js-sdk");
			if (cancelled) return;

			shutdown();
			resetUnread();

			const createdAt = toUnixSeconds(user.createdAt);
			const base = {
				app_id: intercomAppId,
				user_id: user.id,
				name: user.name,
				email: user.email,
				...(createdAt !== undefined ? { created_at: createdAt } : {}),
				...(intercomUserHash ? { user_hash: intercomUserHash } : {}),
				...(activeOrganizationId
					? { company: { company_id: activeOrganizationId } }
					: {}),
				custom_attributes: {
					ration_tier: hub.tier,
					ration_tier_expired: hub.isTierExpired,
					ration_credit_balance: hub.balance,
				},
			};

			initIntercom(withHubIntercomLauncher(base));

			// Defer until after paint so `#ration-intercom-launcher` is in the document.
			queueMicrotask(() => {
				if (cancelled) return;
				onUnreadCountChange((count: number) => {
					setHasUnread(count > 0);
				});
			});
		};

		void run();

		return () => {
			cancelled = true;
			resetUnread();
			void import("@intercom/messenger-js-sdk").then(({ shutdown }) =>
				shutdown(),
			);
		};
	}, [
		user.id,
		user.email,
		user.name,
		user.createdAt,
		intercomAppId,
		intercomUserHash,
		activeOrganizationId,
		hub.tier,
		hub.isTierExpired,
		hub.balance,
		setHasUnread,
		resetUnread,
	]);

	return null;
}

export function HubIntercomFromRoot(hub: HubIntercomContext) {
	const data = useRouteLoaderData("root") as RootLoaderSlice | undefined;
	if (!data?.user || !data.intercomAppId) return null;

	return (
		<HubIntercom
			user={data.user}
			intercomAppId={data.intercomAppId}
			intercomUserHash={data.intercomUserHash}
			activeOrganizationId={data.activeOrganizationId}
			hub={hub}
		/>
	);
}
