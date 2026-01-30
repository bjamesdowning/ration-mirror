import { Link } from "react-router";
import { ActionMenu, type ActionMenuItem } from "~/components/hud/ActionMenu";

export type ActionConfig = ActionMenuItem;

export interface StandardCardProps {
	children: React.ReactNode;
	actions: ActionConfig[];
}

export function StandardCard({ children, actions }: StandardCardProps) {
	return (
		<div className="relative group glass-panel rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
			{/* Mobile Action Menu */}
			<div className="md:hidden absolute top-2 right-2 z-20">
				<ActionMenu actions={actions} />
			</div>

			{/* Main Content */}
			{children}

			{/* Desktop Hover Overlay */}
			<div className="absolute inset-0 bg-carbon/60 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center gap-3 backdrop-blur-[2px] rounded-xl z-30 hidden md:flex pointer-events-none group-hover:pointer-events-auto">
				{actions.map((action, index) => {
					// Render Link for navigation actions
					if (action.to) {
						return (
							<Link
								key={`${action.label}-${index}`}
								to={action.to}
								className={`font-bold px-4 py-2 rounded-lg transition-all shadow-lg text-sm ${
									action.destructive
										? "bg-danger text-white hover:bg-danger/90"
										: "bg-platinum text-carbon hover:bg-white"
								} ${
									!action.destructive && action.label === "Edit"
										? "bg-hyper-green text-carbon hover:shadow-glow"
										: ""
								}`}
							>
								{action.label}
							</Link>
						);
					}

					// Render Button for function actions
					return (
						<button
							key={`${action.label}-${index}`}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								action.onClick?.();
							}}
							className={`font-bold px-4 py-2 rounded-lg transition-all shadow-lg text-sm ${
								action.destructive
									? "bg-danger text-white hover:bg-danger/90"
									: action.label === "Edit"
										? "bg-hyper-green text-carbon hover:shadow-glow"
										: "bg-platinum text-carbon hover:bg-white"
							}`}
						>
							{action.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
