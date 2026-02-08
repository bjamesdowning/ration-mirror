import { DOMAIN_ICONS, DOMAIN_LABELS, ITEM_DOMAINS } from "~/lib/domain";
import { FilterChip } from "./FilterSheet";

type ItemDomain = (typeof ITEM_DOMAINS)[number];

interface DomainFilterChipsProps {
	activeDomain: ItemDomain | "all";
	onDomainChange: (domain: ItemDomain | "all") => void;
}

export function DomainFilterChips({
	activeDomain,
	onDomainChange,
}: DomainFilterChipsProps) {
	return (
		<div>
			<h4 className="text-sm font-medium text-muted mb-3">Domain</h4>
			<div className="flex flex-wrap gap-2">
				<FilterChip
					label="All"
					isActive={activeDomain === "all"}
					onClick={() => onDomainChange("all")}
				/>
				{ITEM_DOMAINS.map((domain) => {
					const Icon = DOMAIN_ICONS[domain];
					return (
						<FilterChip
							key={domain}
							label={DOMAIN_LABELS[domain]}
							icon={<Icon className="w-4 h-4" />}
							isActive={activeDomain === domain}
							onClick={() => onDomainChange(domain)}
						/>
					);
				})}
			</div>
		</div>
	);
}
