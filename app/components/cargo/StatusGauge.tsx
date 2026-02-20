import { formatCargoStatus } from "~/lib/cargo";

interface StatusGaugeProps {
	status?: string | null;
	expiresAt?: Date | string | null;
}

function parseDate(value?: Date | string | null) {
	if (!value) return null;
	if (value instanceof Date) return value;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inferStatus(expiresAt?: Date | null) {
	if (!expiresAt) return "stable";
	const msPerDay = 1000 * 60 * 60 * 24;
	const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / msPerDay;
	if (daysUntilExpiry < 0) return "biohazard";
	if (daysUntilExpiry < 3) return "decay_imminent";
	return "stable";
}

function getGaugeWidth(expiresAt?: Date | null) {
	if (!expiresAt) return 100;
	const msPerDay = 1000 * 60 * 60 * 24;
	const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / msPerDay;
	const clampedDays = Math.max(0, Math.min(30, daysUntilExpiry));
	return Math.round((clampedDays / 30) * 100);
}

export function StatusGauge({ status, expiresAt }: StatusGaugeProps) {
	const parsedExpiry = parseDate(expiresAt);
	const resolvedStatus = status || inferStatus(parsedExpiry);
	const gaugeWidth = getGaugeWidth(parsedExpiry);
	const gaugeColor =
		resolvedStatus === "biohazard"
			? "bg-danger"
			: resolvedStatus === "decay_imminent"
				? "bg-warning"
				: "bg-hyper-green";

	return (
		<div className="mt-auto relative">
			<div className="flex justify-between text-sm text-muted mb-2">
				<span>Freshness</span>
				<span className="text-data text-carbon">
					{parsedExpiry ? parsedExpiry.toLocaleDateString() : "No expiry"}
				</span>
			</div>
			<div className="h-2 w-full bg-platinum rounded-full overflow-hidden">
				<div
					className={`h-full ${gaugeColor} rounded-full transition-all duration-300`}
					style={{ width: `${gaugeWidth}%` }}
				/>
			</div>
			<div className="mt-2 text-sm text-muted">
				{formatCargoStatus(resolvedStatus)}
			</div>
		</div>
	);
}
