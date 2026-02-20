import { requireAuth } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import type { Route } from "./+types/select-group";

export async function loader({ request, context }: Route.LoaderArgs) {
	await requireAuth(context, request);
	return {};
}

export default function SelectGroupPage() {
	const { data: organizations, isPending } = authClient.useListOrganizations();

	// Auto-select if only one organization
	if (organizations && organizations.length > 0) {
		const _handleSelect = async (orgId: string) => {
			await authClient.organization.setActive({
				organizationId: orgId,
			});
			window.location.href = "/hub";
		};

		// If currently loading, just show loading state
		// If 1 org, we could auto-redirect, but better to let user see feedback?
		// Actually, let's just show the list.
	}

	return (
		<div className="min-h-screen bg-ceramic flex flex-col items-center justify-center p-4">
			<div className="max-w-md w-full glass-panel rounded-xl p-8">
				<div className="flex justify-center mb-6">
					<img
						src="/static/ration-logo.svg"
						alt="Ration"
						className="w-12 h-12"
					/>
				</div>

				<h1 className="text-2xl font-bold text-carbon text-center mb-2">
					Select Mission Control
				</h1>
				<p className="text-muted text-center mb-8">
					Choose a group to access its Cargo and Supply.
				</p>

				{isPending ? (
					<div className="flex justify-center py-8">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-hyper-green" />
					</div>
				) : organizations && organizations.length > 0 ? (
					<div className="space-y-3">
						{organizations.map((org) => (
							<button
								key={org.id}
								type="button"
								onClick={async () => {
									await authClient.organization.setActive({
										organizationId: org.id,
									});
									window.location.href = "/hub";
								}}
								className="w-full flex items-center justify-between p-4 bg-platinum/30 hover:bg-hyper-green/10 border border-transparent hover:border-hyper-green/30 rounded-lg transition-all group"
							>
								<span className="font-bold text-carbon">{org.name}</span>
								<svg
									aria-hidden="true"
									className="w-5 h-5 text-muted group-hover:text-hyper-green"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M13 7l5 5m0 0l-5 5m5-5H6"
									/>
								</svg>
							</button>
						))}
					</div>
				) : (
					<div className="text-center py-6">
						<p className="text-muted mb-4">You don't have any groups yet.</p>
						<button
							type="button"
							onClick={async () => {
								await authClient.organization.create({
									name: "My Personal Group",
									slug: `personal-${Date.now()}`,
								});
								window.location.reload();
							}}
							className="px-6 py-3 bg-hyper-green text-carbon font-bold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
						>
							Create Personal Group
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
