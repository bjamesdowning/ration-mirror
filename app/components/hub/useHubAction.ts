import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { HUB_ACTION_PARAM, type HubActionId } from "~/lib/hub-actions";

/** Opens the page's existing flow once when the hub menu navigates here. */
export function useOpenHubAction(
	id: HubActionId,
	enabled: boolean,
	open: () => void,
) {
	const [params, setParams] = useSearchParams();
	const requested = params.get(HUB_ACTION_PARAM) === id;
	const openRef = useRef(open);
	openRef.current = open;
	const handled = useRef(false);

	useEffect(() => {
		if (!requested || handled.current) return;
		handled.current = true;
		const next = new URLSearchParams(params);
		next.delete(HUB_ACTION_PARAM);
		setParams(next, { replace: true });
		if (enabled) openRef.current();
	}, [requested, enabled, params, setParams]);
}
