import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import {
	type CalendarSpan,
	CalendarSpanPicker,
} from "~/components/manifest/CalendarSpanPicker";

interface CalendarSpanSelectorProps {
	currentSpan: CalendarSpan;
	onSpanChange?: (span: CalendarSpan) => void;
	/** Stretch buttons to fill container width (e.g. mobile filter drawer). */
	fullWidth?: boolean;
}

export function CalendarSpanSelector({
	currentSpan,
	onSpanChange,
	fullWidth = false,
}: CalendarSpanSelectorProps) {
	const fetcher = useFetcher<{ success?: boolean }>();
	const pendingSpanRef = useRef<CalendarSpan | null>(null);

	const handleChange = (span: CalendarSpan) => {
		if (span === currentSpan) return;
		pendingSpanRef.current = span;
		fetcher.submit(
			{ intent: "update-manifest-calendar-span", span: String(span) },
			{ method: "post", action: "/hub/manifest" },
		);
	};

	useEffect(() => {
		if (fetcher.state !== "idle") return;
		if (fetcher.data?.success && pendingSpanRef.current !== null) {
			onSpanChange?.(pendingSpanRef.current);
			pendingSpanRef.current = null;
			return;
		}
		if (pendingSpanRef.current !== null) {
			pendingSpanRef.current = null;
		}
	}, [fetcher.state, fetcher.data, onSpanChange]);

	return (
		<div className="flex items-center gap-2">
			<CalendarSpanPicker
				currentSpan={currentSpan}
				onChange={handleChange}
				fullWidth={fullWidth}
			/>
			{fetcher.state !== "idle" && (
				<span className="text-hyper-green animate-pulse text-sm">
					Saving...
				</span>
			)}
		</div>
	);
}
