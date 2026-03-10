import { useNavigate } from "react-router";
import { ActionMenu, type ActionMenuItem } from "~/components/hud/ActionMenu";

export type ActionConfig = ActionMenuItem;

export interface StandardCardProps {
	children: React.ReactNode;
	actions: ActionConfig[];
	/** When provided, clicking anywhere on the card navigates to this path. */
	to?: string;
}

export function StandardCard({ children, actions, to }: StandardCardProps) {
	const navigate = useNavigate();

	const menu = (
		<div className="absolute top-2 right-2 z-10 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity">
			<ActionMenu actions={actions} />
		</div>
	);

	if (to) {
		return (
			// biome-ignore lint/a11y/useSemanticElements: <a> creates nested-anchor violations (MealCard source URL); <button> creates nested-interactive violations (ActionMenu trigger). div[role="link"] with tabIndex and onKeyDown is intentional and keyboard-accessible.
			<div
				role="link"
				tabIndex={0}
				className="relative group glass-panel rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer"
				onClick={() => navigate(to)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						navigate(to);
					}
				}}
			>
				{menu}
				<div className="pr-12">{children}</div>
			</div>
		);
	}

	return (
		<div className="relative group glass-panel rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
			{menu}
			<div className="pr-12">{children}</div>
		</div>
	);
}
