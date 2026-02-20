import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouteLoaderData } from "react-router";
import { authClient } from "~/lib/auth-client";
import type { OrganizationWithCredits } from "~/lib/types";

export function GroupSwitcher() {
	const session = authClient.useSession();
	const organizations = authClient.useListOrganizations();
	const navigate = useNavigate();
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Get credits from dashboard loader
	const dashboardData = useRouteLoaderData("routes/hub") as {
		balance: number;
		tier?: "free" | "crew_member";
	} | null;

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

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => {
				document.removeEventListener("mousedown", handleClickOutside);
			};
		}
	}, [isOpen]);

	const handleSwitch = async (orgId: string) => {
		await authClient.organization.setActive({
			organizationId: orgId,
		});
		setIsOpen(false);
		// Reload to ensure all server loaders re-run with new context
		window.location.reload();
	};

	return (
		<div ref={dropdownRef} className="relative z-50">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
				aria-haspopup="true"
				className="flex items-center gap-3 px-3 py-2 rounded-lg bg-platinum/50 hover:bg-platinum transition-all border border-transparent hover:border-carbon/10"
			>
				<div className="flex flex-col items-start text-left">
					<span className="text-sm font-bold text-carbon leading-tight">
						{displayName}
					</span>
					{activeOrg && (
						<div className="flex items-center gap-2">
							<span className="text-[10px] uppercase tracking-wide text-hyper-green font-medium">
								{credits} Credits
							</span>
							<span
								className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
									tierLabel === "CREW"
										? "bg-hyper-green/10 text-hyper-green"
										: "bg-platinum text-muted"
								}`}
							>
								{tierLabel}
							</span>
						</div>
					)}
				</div>
				<svg
					aria-hidden="true"
					className={`w-4 h-4 text-muted transition-all ${
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

			{/* Dropdown Menu */}
			<div
				className={`absolute left-0 top-full mt-2 w-64 bg-ceramic border border-platinum rounded-xl shadow-xl transition-all transform origin-top-left z-50 ${
					isOpen
						? "opacity-100 visible"
						: "opacity-0 invisible pointer-events-none"
				}`}
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
									className="w-4 h-4 text-hyper-green"
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
							setIsOpen(false);
							navigate("/hub/groups/new");
						}}
						// Future: navigate("/groups/create")
						className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-platinum hover:text-carbon transition-colors"
					>
						<svg
							aria-hidden="true"
							className="w-4 h-4"
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
		</div>
	);
}
