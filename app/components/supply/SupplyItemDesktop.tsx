import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { SupplyItemCheckbox } from "./SupplyItemCheckbox";
import { SupplyItemSourceLine } from "./SupplyItemSourceLine";
import { SupplyQuantityEditor } from "./SupplyQuantityEditor";

interface SupplyItemDesktopProps {
	displayName: string;
	mealSourced: boolean;
	convertLabel: string;
	optimisticPurchased: boolean;
	isPending: boolean;
	localQuantity: number;
	localUnit: string;
	onToggle: () => void;
	onQuantityChange: (quantity: number, unit: string) => void;
	onConvert: () => void;
	onSnooze: (duration: "24h" | "3d" | "1w") => void;
	onDelete: () => void;
	sourceMealName: string | null | undefined;
	sourceMealNames?: string[] | null;
	sourceMealSources?: { id: string; name: string }[];
}

export function SupplyItemDesktop({
	displayName,
	mealSourced,
	convertLabel,
	optimisticPurchased,
	isPending,
	localQuantity,
	localUnit,
	onToggle,
	onQuantityChange,
	onConvert,
	onSnooze,
	onDelete,
	sourceMealName,
	sourceMealNames,
	sourceMealSources,
}: SupplyItemDesktopProps) {
	const [showMenu, setShowMenu] = useState(false);

	const nameClasses = `text-carbon dark:text-white ${
		optimisticPurchased ? "line-through text-muted" : ""
	}`;

	return (
		<div className="flex items-center gap-3">
			<SupplyItemCheckbox
				optimisticPurchased={optimisticPurchased}
				isPending={isPending}
				onClick={onToggle}
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-3">
					<span
						className={`flex-1 min-w-0 truncate font-medium ${nameClasses}`}
						title={displayName}
					>
						{displayName}
					</span>
					<SupplyQuantityEditor
						quantity={localQuantity}
						unit={localUnit}
						onChange={onQuantityChange}
						disabled={optimisticPurchased || isPending}
						variant="inline"
					/>
					<div className="relative flex-shrink-0">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setShowMenu(!showMenu);
							}}
							className={`opacity-0 group-hover:opacity-100 text-muted hover:text-carbon transition-all p-1 ${
								showMenu ? "opacity-100 text-carbon" : ""
							}`}
							aria-label="Item actions"
							aria-expanded={showMenu}
						>
							<MoreHorizontal className="w-4 h-4" aria-hidden="true" />
						</button>
						{showMenu && (
							<>
								<button
									type="button"
									className="fixed inset-0 z-30 w-full h-full cursor-default focus:outline-none"
									onClick={() => setShowMenu(false)}
									aria-label="Close menu"
								/>
								<div className="absolute right-0 top-full mt-1 z-40 glass-panel rounded-xl shadow-lg p-2 min-w-[200px]">
									<button
										type="button"
										onClick={() => {
											onConvert();
											setShowMenu(false);
										}}
										disabled={isPending}
										className="w-full px-4 py-2 rounded-lg text-left text-sm text-carbon hover:bg-platinum transition-colors disabled:opacity-30"
									>
										{convertLabel}
									</button>
									{mealSourced && (
										<>
											<button
												type="button"
												onClick={() => {
													onSnooze("24h");
													setShowMenu(false);
												}}
												className="w-full px-4 py-2 rounded-lg text-left text-sm text-carbon hover:bg-platinum transition-colors"
											>
												Snooze 24h
											</button>
											<button
												type="button"
												onClick={() => {
													onSnooze("3d");
													setShowMenu(false);
												}}
												className="w-full px-4 py-2 rounded-lg text-left text-sm text-carbon hover:bg-platinum transition-colors"
											>
												Snooze 3 days
											</button>
											<button
												type="button"
												onClick={() => {
													onSnooze("1w");
													setShowMenu(false);
												}}
												className="w-full px-4 py-2 rounded-lg text-left text-sm text-carbon hover:bg-platinum transition-colors"
											>
												Snooze 1 week
											</button>
										</>
									)}
									<div className="border-t border-platinum my-1" />
									<button
										type="button"
										onClick={() => {
											onDelete();
											setShowMenu(false);
										}}
										className="w-full px-4 py-2 rounded-lg text-left text-sm text-danger hover:bg-danger/10 transition-colors"
									>
										Remove
									</button>
								</div>
							</>
						)}
					</div>
				</div>
				<SupplyItemSourceLine
					sourceMealName={sourceMealName}
					sourceMealNames={sourceMealNames}
					sourceMealSources={sourceMealSources}
				/>
			</div>
		</div>
	);
}
