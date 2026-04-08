import { useEffect } from "react";
import { useRouteLoaderData } from "react-router";
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
 * Calls `shutdown` on unmount to avoid leaking identity on shared devices.
 */
export function HubIntercom({
	user,
	intercomAppId,
	intercomUserHash,
	activeOrganizationId,
	hub,
}: HubIntercomProps) {
	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			const { default: initIntercom, shutdown } = await import(
				"@intercom/messenger-js-sdk"
			);
			if (cancelled) return;

			shutdown();

			const createdAt = toUnixSeconds(user.createdAt);
			initIntercom({
				app_id: intercomAppId,
				user_id: user.id,
				name: user.name,
				email: user.email,
				...(createdAt !== undefined ? { created_at: createdAt } : {}),
				...(intercomUserHash ? { user_hash: intercomUserHash } : {}),
				vertical_padding: 80,
				horizontal_padding: 16,
				...(activeOrganizationId
					? { company: { company_id: activeOrganizationId } }
					: {}),
				custom_attributes: {
					ration_tier: hub.tier,
					ration_tier_expired: hub.isTierExpired,
					ration_credit_balance: hub.balance,
				},
			});
		};

		void run();

		return () => {
			cancelled = true;
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
