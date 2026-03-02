import { MoreVertical } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Link } from "react-router";

export interface ActionMenuItem {
	label: string;
	icon?: React.ReactNode;
	onClick?: () => void;
	to?: string;
	reloadDocument?: boolean;
	destructive?: boolean;
}

interface ActionMenuProps {
	actions: ActionMenuItem[];
}

export function ActionMenu({ actions }: ActionMenuProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
		null,
	);
	const buttonRef = useRef<HTMLButtonElement>(null);

	const handleOpen = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!isOpen && buttonRef.current) {
			const rect = buttonRef.current.getBoundingClientRect();
			setMenuPos({
				top: rect.bottom + 4,
				right: window.innerWidth - rect.right,
			});
		}
		setIsOpen((prev) => !prev);
	};

	const handleClose = useCallback(() => {
		setIsOpen(false);
		setMenuPos(null);
	}, []);

	// Close on scroll or resize to avoid stale positioning
	useEffect(() => {
		if (!isOpen) return;
		window.addEventListener("scroll", handleClose, {
			capture: true,
			passive: true,
		});
		window.addEventListener("resize", handleClose, { passive: true });
		return () => {
			window.removeEventListener("scroll", handleClose, { capture: true });
			window.removeEventListener("resize", handleClose);
		};
	}, [isOpen, handleClose]);

	const handleAction = (action: ActionMenuItem) => {
		if (action.onClick) {
			action.onClick();
		}
		handleClose();
	};

	const dropdownContent =
		isOpen && menuPos
			? createPortal(
					<>
						{/* Backdrop */}
						<button
							type="button"
							className="fixed inset-0 z-[9998] w-full h-full cursor-default focus:outline-none"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleClose();
							}}
							aria-label="Close menu"
						/>

						{/* Dropdown — rendered outside overflow ancestors via portal */}
						<div
							className="fixed z-[9999] glass-panel rounded-xl shadow-lg p-2 min-w-[160px]"
							style={{ top: menuPos.top, right: menuPos.right }}
						>
							{actions.map((action, index) => {
								const Content = () => (
									<>
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
									</>
								);

								if (action.to) {
									return (
										<Link
											key={`${action.label}-${index}`}
											to={action.to}
											reloadDocument={action.reloadDocument}
											onClick={handleClose}
											className={`block w-full px-4 py-2 rounded-lg text-left transition-colors flex items-center gap-3 ${
												action.destructive
													? "text-danger hover:bg-danger/10"
													: "text-carbon hover:bg-platinum"
											}`}
										>
											<Content />
										</Link>
									);
								}

								return (
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
										<Content />
									</button>
								);
							})}
						</div>
					</>,
					document.body,
				)
			: null;

	return (
		<div className="relative">
			<button
				ref={buttonRef}
				type="button"
				onClick={handleOpen}
				className="flex items-center justify-center w-8 h-8 rounded-lg bg-ceramic/90 backdrop-blur-sm hover:bg-platinum transition-colors shadow-sm"
				aria-label="More actions"
			>
				<MoreVertical className="w-4 h-4 text-carbon" />
			</button>

			{dropdownContent}
		</div>
	);
}
