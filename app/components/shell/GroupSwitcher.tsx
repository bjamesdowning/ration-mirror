import { useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";
import type { OrganizationWithCredits } from "~/lib/types";

export function GroupSwitcher() {
	const session = authClient.useSession();
	const organizations = authClient.useListOrganizations();
	const navigate = useNavigate();

	const activeOrgId = session.data?.session.activeOrganizationId;
	const activeOrg = organizations.data?.find((org) => org.id === activeOrgId) as
		| OrganizationWithCredits
		| undefined;

	// Fallback to name or "Select Group"
	const displayName = activeOrg?.name || "Select Group";
	const credits = activeOrg?.credits ?? 0;

	const handleSwitch = async (orgId: string) => {
		await authClient.organization.setActive({
			organizationId: orgId,
		});
		// Reload to ensure all server loaders re-run with new context
		window.location.reload();
	};

	return (
		<div className="relative group z-50">
			<button
				type="button"
				className="flex items-center gap-3 px-3 py-2 rounded-lg bg-platinum/50 hover:bg-platinum transition-all border border-transparent hover:border-carbon/10"
			>
				<div className="flex flex-col items-start text-left">
					<span className="text-sm font-bold text-carbon leading-tight">
						{displayName}
					</span>
					{activeOrg && (
						<span className="text-[10px] uppercase tracking-wide text-hyper-green font-medium">
							{credits} Credits
						</span>
					)}
				</div>
				<svg
					aria-hidden="true"
					className="w-4 h-4 text-muted group-hover:text-carbon transition-colors"
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
			<div className="absolute left-0 top-full mt-2 w-64 bg-ceramic border border-platinum rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all transform origin-top-left">
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
						onClick={() => navigate("/dashboard/groups/new")}
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
