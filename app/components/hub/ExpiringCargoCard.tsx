import { Link } from "react-router";
import type { cargo } from "~/db/schema";
import { AlertIcon, SuccessIcon } from "../icons/HubIcons";

interface ExpiringCargoCardProps {
	items: (typeof cargo.$inferSelect)[];
	alertDays: number;
}

function formatDaysUntilExpiry(expiresAt: Date | null): string {
	if (!expiresAt) return "Unknown";
	const now = new Date();
	const msPerDay = 1000 * 60 * 60 * 24;
	const days = Math.ceil((expiresAt.getTime() - now.getTime()) / msPerDay);
	if (days <= 0) return "Expired";
	if (days === 1) return "1 day";
	return `${days} days`;
}

function getExpiryStatusColor(expiresAt: Date | null): string {
	if (!expiresAt) return "text-muted";
	const now = new Date();
	const msPerDay = 1000 * 60 * 60 * 24;
	const days = Math.ceil((expiresAt.getTime() - now.getTime()) / msPerDay);
	if (days <= 0) return "text-danger";
	if (days <= 2) return "text-warning";
	return "text-hyper-green";
}

export function ExpiringCargoCard({
	items,
	alertDays,
}: ExpiringCargoCardProps) {
	const hasItems = items.length > 0;

	return (
		<div className="glass-panel rounded-xl p-6 h-full">
			{/* Header */}
			<div className="flex items-start justify-between mb-4">
				<div className="flex items-center gap-2">
					<AlertIcon />
					<div>
						<h3 className="text-label text-carbon font-bold">Expiring Soon</h3>
						<p className="text-xs text-muted mt-1">
							Items expiring within {alertDays} days
						</p>
					</div>
				</div>
				{hasItems && (
					<span className="bg-warning/10 text-warning text-xs font-bold px-2 py-1 rounded-md">
						{items.length}
					</span>
				)}
			</div>

			{/* Items List */}
			{hasItems ? (
				<ul className="space-y-3">
					{items.slice(0, 5).map((item) => (
						<li
							key={item.id}
							className="flex items-center justify-between text-sm"
						>
							<span className="text-carbon truncate mr-2" title={item.name}>
								{item.name}
							</span>
							<span
								className={`text-xs font-medium whitespace-nowrap ${getExpiryStatusColor(item.expiresAt)}`}
							>
								{formatDaysUntilExpiry(item.expiresAt)}
							</span>
						</li>
					))}
				</ul>
			) : (
				<div className="text-center py-6 flex flex-col items-center">
					<SuccessIcon />
					<p className="text-sm text-muted mt-3">No items expiring soon</p>
				</div>
			)}

			{/* Footer Link */}
			<div className="mt-4 pt-4 border-t border-carbon/10">
				<Link
					to="/hub/cargo"
					className="text-xs text-hyper-green hover:underline flex items-center gap-1"
				>
					Manage Cargo
					<span>→</span>
				</Link>
			</div>
		</div>
	);
}
