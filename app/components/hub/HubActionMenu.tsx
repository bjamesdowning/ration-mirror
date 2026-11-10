import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRouteLoaderData } from "react-router";
import { hubActionPath, visibleHubActions } from "~/lib/hub-actions";

type HubFlagSlice = {
	clientFlags?: {
		nutritionFastLog?: boolean;
		aiScanReceipt?: boolean;
		aiGenerateMeal?: boolean;
		aiPlanWeek?: boolean;
		aiDockFromReceipt?: boolean;
	};
};

/** One Hub menu. Each row starts the feature that already lives on its page. */
export function HubActionMenu() {
	const navigate = useNavigate();
	const root = useRouteLoaderData("root") as HubFlagSlice | undefined;
	const flags = root?.clientFlags;
	const actions = visibleHubActions({
		logToFuel: flags?.nutritionFastLog === true,
		scanToCargo: flags?.aiScanReceipt === true,
		generateMeal: flags?.aiGenerateMeal === true,
		planWeek: flags?.aiPlanWeek === true,
		dockFromReceipt:
			flags?.aiDockFromReceipt === true && flags?.aiScanReceipt === true,
	});
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [menuStyle, setMenuStyle] = useState<{ top: number; left: number }>({
		top: 0,
		left: 0,
	});

	useEffect(() => {
		if (!open || !buttonRef.current) return;
		const rect = buttonRef.current.getBoundingClientRect();
		const width = 220;
		setMenuStyle({
			top: rect.bottom + 8,
			left: Math.max(8, rect.right - width),
		});
	}, [open]);

	if (actions.length === 0) return null;

	return (
		<div className="relative">
			<button
				ref={buttonRef}
				type="button"
				aria-label="Hub actions"
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
				className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-carbon dark:text-white bg-platinum/50 dark:bg-white/10 hover:bg-platinum dark:hover:bg-white/20 transition-all"
			>
				<Plus className="w-4 h-4" aria-hidden />
			</button>
			{open
				? createPortal(
						<>
							<button
								type="button"
								className="fixed inset-0 z-[60] cursor-default"
								aria-label="Close hub actions"
								onClick={() => setOpen(false)}
							/>
							<div
								role="menu"
								aria-label="Hub actions"
								className="fixed z-[70] min-w-[220px] glass-panel rounded-xl p-2 shadow-lg"
								style={{ top: menuStyle.top, left: menuStyle.left }}
							>
								{actions.map((action) => (
									<button
										key={action.id}
										type="button"
										role="menuitem"
										className="block w-full rounded-lg px-4 py-2 text-left text-sm font-medium text-carbon hover:bg-platinum"
										onClick={() => {
											setOpen(false);
											navigate(hubActionPath(action.id));
										}}
									>
										{action.label}
									</button>
								))}
							</div>
						</>,
						document.body,
					)
				: null}
		</div>
	);
}
