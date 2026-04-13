import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRevalidator, useRouteLoaderData } from "react-router";
import { DiamondIcon } from "~/components/icons/PageIcons";
import { GroupAvatar } from "~/components/shell/GroupAvatar";
import { authClient } from "~/lib/auth-client";
import type { OrganizationWithCredits } from "~/lib/types";

export function GroupSwitcher() {
	const session = authClient.useSession();
	const organizations = authClient.useListOrganizations();
	const navigate = useNavigate();
	const revalidator = useRevalidator();
	const [isOpen, setIsOpen] = useState(false);
	const [isSwitching, setIsSwitching] = useState(false);
	const [menuPos, setMenuPos] = useState<{
		top: number;
		left?: number;
		right?: number;
	} | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);

	// Get credits and org logo from dashboard loader
	const hubData = useRouteLoaderData("routes/hub") as {
		balance: number;
		tier?: "free" | "crew_member";
		activeOrganizationLogo?: string | null;
	} | null;
	const dashboardData = hubData;

	const activeOrgId = session.data?.session.activeOrganizationId;
	const activeOrg = organizations.data?.find((org) => org.id === activeOrgId) as
		| OrganizationWithCredits
		| undefined;

	// Fallback to name or "Select Group"
	// If activeOrg is undefined but activeOrgId is set, it might be loading or the user is in a group not yet in the list.
	// But we can try to trust the session metadata if available? Better auth session doesn't usually carry org name.
	// We'll stick to "Select Group" but maybe add a loading indicator or check pending state.
	const displayName =
		activeOrg?.name || (session.isPending ? "Loading..." : "Select Group");
	const credits = dashboardData?.balance ?? activeOrg?.credits ?? 0;
	const tierLabel = dashboardData?.tier === "crew_member" ? "CREW" : "FREE";

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

	const handleOpen = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!isOpen && buttonRef.current) {
			const rect = buttonRef.current.getBoundingClientRect();
			const menuWidth = 256;
			const right = window.innerWidth - rect.right;
			const wouldOverflowLeft = right + menuWidth > window.innerWidth;
			setMenuPos(
				wouldOverflowLeft
					? {
							top: rect.bottom + 8,
							left: Math.max(8, rect.left),
						}
					: {
							top: rect.bottom + 8,
							right,
						},
			);
		}
		setIsOpen((prev) => !prev);
	};

	const handleSwitch = async (orgId: string) => {
		if (orgId === activeOrgId) return;
		handleClose();
		setIsSwitching(true);
		try {
			await authClient.organization.setActive({
				organizationId: orgId,
			});
			navigate("/hub", { replace: true });
			revalidator.revalidate();
		} finally {
			setIsSwitching(false);
		}
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
							className="fixed z-[9999] w-64 bg-ceramic border border-platinum rounded-xl shadow-xl"
							style={{
								top: menuPos.top,
								left: menuPos.left,
								right: menuPos.right,
							}}
						>
							<div className="p-2 space-y-1">
								<div className="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wider">
									Switch Group
								</div>

								{organizations.data?.map((org) => (
									<button
										key={org.id}
										type="button"
										onClick={() => handleSwitch(org.id)}
										className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
											org.id === activeOrgId
												? "bg-hyper-green/10 text-carbon font-medium"
												: "text-muted hover:bg-platinum hover:text-carbon"
										}`}
									>
										<span className="truncate">{org.name}</span>
										{org.id === activeOrgId && (
											<svg
												aria-hidden="true"
												className="w-4 h-4 text-hyper-green shrink-0"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 13l4 4L19 7"
												/>
											</svg>
										)}
									</button>
								))}

								<div className="h-px bg-platinum my-1" />

								<button
									type="button"
									onClick={() => {
										handleClose();
										navigate("/hub/groups/new");
									}}
									className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-platinum hover:text-carbon transition-colors"
								>
									<svg
										aria-hidden="true"
										className="w-4 h-4 shrink-0"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M12 4v16m8-8H4"
										/>
									</svg>
									Create New Group
								</button>
							</div>
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
				disabled={isSwitching}
				aria-expanded={isOpen}
				aria-haspopup="true"
				aria-busy={isSwitching}
				aria-label={`${displayName}, ${credits} credits`}
				title={displayName}
				className="flex items-center gap-2 px-2.5 md:px-3.5 py-2 min-h-[44px] rounded-xl border border-platinum/60 dark:border-white/10 bg-platinum/35 dark:bg-white/[0.06] hover:bg-platinum/55 dark:hover:bg-white/10 hover:border-platinum dark:hover:border-white/15 shadow-sm transition-all min-w-0 disabled:opacity-70 disabled:cursor-wait"
			>
				{/* Mobile: avatar only; Desktop: full name */}
				<div className="hidden md:flex items-center gap-2 min-w-0 flex-1">
					<span
						className="text-sm font-bold text-carbon leading-none max-w-[160px] truncate"
						title={displayName}
					>
						{isSwitching ? "Switching..." : displayName}
					</span>
				</div>
				<div className="md:hidden shrink-0" aria-hidden>
					{activeOrg ? (
						<GroupAvatar
							name={activeOrg.name}
							orgId={activeOrg.id}
							image={hubData?.activeOrganizationLogo ?? activeOrg.logo ?? null}
							size="sm"
						/>
					) : (
						<div className="w-9 h-9 rounded-full bg-platinum/50 flex items-center justify-center text-xs font-bold text-muted shrink-0">
							?
						</div>
					)}
				</div>
				{activeOrg && (
					<span className="text-[10px] uppercase tracking-wide text-hyper-green font-medium leading-none flex items-center gap-0.5">
						{credits}
						<DiamondIcon className="w-3 h-3 text-hyper-green shrink-0" />
					</span>
				)}
				{activeOrg && tierLabel === "CREW" && (
					<span className="text-[10px] uppercase tracking-wide px-1 rounded-full bg-hyper-green/10 text-hyper-green leading-none">
						{tierLabel}
					</span>
				)}
				<svg
					aria-hidden="true"
					className={`w-3.5 h-3.5 text-muted transition-all shrink-0 ${
						isOpen ? "text-carbon rotate-180" : ""
					}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>

			{dropdownContent}
		</div>
	);
}
