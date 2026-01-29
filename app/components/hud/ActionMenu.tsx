import { MoreVertical } from "lucide-react";
import { useState } from "react";

interface ActionMenuItem {
	label: string;
	icon?: React.ReactNode;
	onClick: () => void;
	destructive?: boolean;
}

interface ActionMenuProps {
	actions: ActionMenuItem[];
}

export function ActionMenu({ actions }: ActionMenuProps) {
	const [isOpen, setIsOpen] = useState(false);

	const handleAction = (action: ActionMenuItem) => {
		action.onClick();
		setIsOpen(false);
	};

	return (
		<div className="relative">
			<button
				type="button"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setIsOpen(!isOpen);
				}}
				className="flex items-center justify-center w-8 h-8 rounded-lg bg-ceramic/90 backdrop-blur-sm hover:bg-platinum transition-colors shadow-sm"
				aria-label="More actions"
			>
				<MoreVertical className="w-4 h-4 text-carbon" />
			</button>

			{isOpen && (
				<>
					{/* Backdrop */}
					<button
						type="button"
						className="fixed inset-0 z-30 w-full h-full cursor-default focus:outline-none"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setIsOpen(false);
						}}
						aria-label="Close menu"
					/>

					{/* Dropdown */}
					<div className="absolute right-0 top-full mt-1 z-40 glass-panel rounded-xl shadow-lg p-2 min-w-[160px]">
						{actions.map((action, index) => (
							<button
								key={`${action.label}-${index}`}
								type="button"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									handleAction(action);
								}}
								className={`w-full px-4 py-2 rounded-lg text-left transition-colors flex items-center gap-3 ${
									action.destructive
										? "text-danger hover:bg-danger/10"
										: "text-carbon hover:bg-platinum"
								}`}
							>
								{action.icon && (
									<span
										className={
											action.destructive ? "text-danger" : "text-muted"
										}
									>
										{action.icon}
									</span>
								)}
								<div className="text-sm font-medium">{action.label}</div>
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
}
