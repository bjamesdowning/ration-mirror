import { formatInventoryStatus } from "~/lib/inventory";

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
			? "bg-red-500"
			: resolvedStatus === "decay_imminent"
				? "bg-yellow-500"
				: "bg-[#39FF14]";

	return (
		<div className="mt-auto relative">
			<div className="flex justify-between text-[10px] uppercase opacity-70 mb-1">
				<span>Integrity</span>
				<span>
					{parsedExpiry ? parsedExpiry.toLocaleDateString() : "STABLE"}
				</span>
			</div>
			<div className="h-1 w-full bg-[#39FF14]/20">
				<div
					className={`h-full ${gaugeColor} transition-all duration-500`}
					style={{ width: `${gaugeWidth}%` }}
				/>
			</div>
			<div className="mt-2 text-[10px] uppercase tracking-widest opacity-70">
				{formatInventoryStatus(resolvedStatus)}
			</div>
		</div>
	);
}
