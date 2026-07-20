import { CheckIcon } from "~/components/icons/PageIcons";
import { WELCOME_CREDITS } from "~/lib/billing.constants";
import { CREW_COPILOT_DAILY_CONVERSATIONS } from "~/lib/copilot/constants";
import type { TierLimits, TierSlug } from "~/lib/tiers";

type FeatureValue = boolean | string;

function FeatureRow({
	label,
	free = false,
	crew = false,
}: {
	label: string;
	free?: FeatureValue;
	crew?: FeatureValue;
}) {
	const renderCell = (value: FeatureValue) => {
		if (value === true)
			return <CheckIcon className="w-4 h-4 text-hyper-green mx-auto" />;
		if (value === false) return <span className="text-carbon/20">—</span>;
		return <span className="text-carbon">{value}</span>;
	};
	return (
		<tr>
			<td className="px-4 py-2.5 text-carbon">{label}</td>
			<td className="px-4 py-2.5 text-center">{renderCell(free)}</td>
			<td className="px-4 py-2.5 text-center">{renderCell(crew)}</td>
		</tr>
	);
}

function SectionHeader({ label }: { label: string }) {
	return (
		<tr className="bg-carbon/[0.02]">
			<td
				colSpan={3}
				className="px-4 py-2 text-xs uppercase tracking-wider text-muted font-semibold"
			>
				{label}
			</td>
		</tr>
	);
}

export type PricingFeatureMatrixLimits = Record<TierSlug, TierLimits>;

/** Full Free vs Crew feature matrix shared by splash and hub pricing. */
export function PricingFeatureMatrix({
	tierLimits,
	className = "w-full min-w-[32rem] text-sm",
}: {
	tierLimits: PricingFeatureMatrixLimits;
	className?: string;
}) {
	const free = tierLimits.free;
	const crew = tierLimits.crew_member;

	return (
		<table className={className}>
			<thead>
				<tr className="border-b border-carbon/10">
					<th className="text-left p-4 text-muted font-normal">Feature</th>
					<th className="p-4 text-center text-carbon font-semibold w-28">
						Free
					</th>
					<th className="p-4 text-center text-hyper-green font-semibold w-28">
						Crew
					</th>
				</tr>
			</thead>
			<tbody className="divide-y divide-carbon/5">
				<SectionHeader label="Cargo" />
				<FeatureRow
					label="Cargo items"
					free={`${free.maxInventoryItems}`}
					crew="Unlimited"
				/>
				<FeatureRow label="Manual item entry" free crew />
				<FeatureRow label="CSV/TSV bulk import" free crew />
				<FeatureRow label="Expiry alerts & domain filters" free crew />
				<FeatureRow label="Semantic search & smart filters" free crew />

				<SectionHeader label="Galley" />
				<FeatureRow
					label="Meals & provisions"
					free={`${free.maxMeals}`}
					crew="Unlimited"
				/>
				<FeatureRow label="Match Mode (vector matching)" free crew />
				<FeatureRow label="Promote Cargo to provisions" free crew />

				<SectionHeader label="Manifest" />
				<FeatureRow label="Weekly meal calendar" free crew />
				<FeatureRow label="Consume & auto-deduct" free crew />
				<FeatureRow label="Share manifest via link" crew />

				<SectionHeader label="Supply" />
				<FeatureRow
					label="Supply lists"
					free={`${free.maxGroceryLists}`}
					crew="Unlimited"
				/>
				<FeatureRow label="Auto-generate from Galley & Manifest" free crew />
				<FeatureRow label="Dock Cargo (list → inventory)" free crew />
				<FeatureRow label="Export (text, markdown, CSV)" free crew />
				<FeatureRow label="Share via public link" crew />

				<SectionHeader label="AI (via credits)" />
				<FeatureRow label="Photo & receipt scanning" free crew />
				<FeatureRow label="Meal import via URL" free crew />
				<FeatureRow label="AI meal generation" free crew />
				<FeatureRow label="AI weekly meal planning" free crew />

				<SectionHeader label="Ask Ration (Copilot)" />
				<FeatureRow
					label="Free conversations"
					crew={`${CREW_COPILOT_DAILY_CONVERSATIONS} free chat / group / day`}
				/>
				<FeatureRow label="Credit-billed Copilot chats" free crew />

				<SectionHeader label="Collaboration" />
				<FeatureRow
					label="Groups"
					free={`${free.maxOwnedGroups}`}
					crew={`${crew.maxOwnedGroups}`}
				/>
				<FeatureRow label="Member invites" crew />
				<FeatureRow label="Shared Cargo & Galley" crew />
				<FeatureRow label="Credit transfer between groups" crew />

				<SectionHeader label="Credits" />
				<FeatureRow label="Purchase credit packs" free crew />
				<FeatureRow
					label={`${WELCOME_CREDITS} welcome credits (new human accounts)`}
					free
					crew
				/>

				<SectionHeader label="Integrations" />
				<FeatureRow label="REST API (inventory, galley, supply)" free crew />
				<FeatureRow label="MCP Server (OAuth agent access)" free crew />
			</tbody>
		</table>
	);
}
