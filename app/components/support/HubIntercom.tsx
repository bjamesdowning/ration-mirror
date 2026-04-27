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
	intercomUserJwt: string | null;
	activeOrganizationId: string | null;
};

type HubIntercomProps = {
	user: NonNullable<RootLoaderSlice["user"]>;
	intercomAppId: string;
	intercomUserJwt: string | null;
	activeOrganizationId: string | null;
};

/**
 * Loads Intercom only while the hub layout is mounted (`/hub/*`).
 * Uses a header-bound custom launcher so the default bubble does not cover mobile Supply.
 * Calls `shutdown` on unmount to avoid leaking identity on shared devices.
 *
 * Tier, billing, and other user attributes are signed into `intercomUserJwt` in the
 * root loader — Intercom trusts the JWT values over any unsigned JS attributes.
 */
export function HubIntercom({
	user,
	intercomAppId,
	intercomUserJwt,
	activeOrganizationId,
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
				...(intercomUserJwt ? { intercom_user_jwt: intercomUserJwt } : {}),
				...(activeOrganizationId
					? { company: { company_id: activeOrganizationId } }
					: {}),
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
		intercomUserJwt,
		activeOrganizationId,
		setHasUnread,
		resetUnread,
	]);

	return null;
}

export function HubIntercomFromRoot() {
	const data = useRouteLoaderData("root") as RootLoaderSlice | undefined;
	if (!data?.user || !data.intercomAppId) return null;

	return (
		<HubIntercom
			user={data.user}
			intercomAppId={data.intercomAppId}
			intercomUserJwt={data.intercomUserJwt}
			activeOrganizationId={data.activeOrganizationId}
		/>
	);
}
