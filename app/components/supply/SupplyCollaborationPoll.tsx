import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

const POLL_MS = 12_000;

export function SupplyCollaborationPoll({
	enabled,
	listId,
	revision,
}: {
	enabled: boolean;
	listId: string;
	revision: number;
}) {
	const revalidator = useRevalidator();
	const [remoteRevision, setRemoteRevision] = useState<number | null>(null);
	const etagRef = useRef(`"${revision}"`);

	useEffect(() => {
		etagRef.current = `"${revision}"`;
		setRemoteRevision(null);
	}, [revision]);

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		const poll = async () => {
			if (document.hidden) return;
			try {
				const response = await fetch("/api/supply-lists/catalog", {
					headers: { "If-None-Match": etagRef.current },
				});
				if (cancelled || response.status === 304) return;
				if (!response.ok) return;
				const payload = (await response.json()) as {
					live?: { id: string; revision?: number };
					saved?: Array<{ id: string; revision?: number }>;
					templates?: Array<{ id: string; revision?: number }>;
					archived?: Array<{ id: string; revision?: number }>;
				};
				const nextEtag = response.headers.get("ETag");
				if (nextEtag) etagRef.current = nextEtag;
				const rows = [
					payload.live,
					...(payload.saved ?? []),
					...(payload.templates ?? []),
					...(payload.archived ?? []),
				];
				const current = rows.find((row) => row?.id === listId);
				if (
					typeof current?.revision === "number" &&
					current.revision !== revision
				) {
					setRemoteRevision(current.revision);
				}
			} catch {
				// Offline or rate-limited; try again on the next interval.
			}
		};
		const id = window.setInterval(() => {
			void poll();
		}, POLL_MS);
		const onFocus = () => {
			void poll();
		};
		const onVisibility = () => {
			if (!document.hidden) void poll();
		};
		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			cancelled = true;
			window.clearInterval(id);
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [enabled, listId, revision]);

	if (remoteRevision == null) return null;

	return (
		<div
			className="flex items-center justify-between gap-3 rounded-xl border border-hyper-green/30 bg-hyper-green/10 px-4 py-3"
			role="status"
		>
			<p className="text-sm font-medium text-carbon">
				List changed — refresh to see household updates.
			</p>
			<button
				type="button"
				className="min-h-11 rounded-lg bg-hyper-green px-3 font-semibold text-on-hyper-green"
				onClick={() => {
					setRemoteRevision(null);
					revalidator.revalidate();
				}}
			>
				Refresh
			</button>
		</div>
	);
}
