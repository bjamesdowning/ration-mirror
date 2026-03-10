import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";
import { HubHeader } from "~/components/hub/HubHeader";
import { UpgradePrompt } from "~/components/shell/UpgradePrompt";
import { requireAuth } from "~/lib/auth.server";
import type { Route } from "./+types/groups.new";

type CreateGroupResponse = {
	success?: boolean;
	error?: string;
	upgradePath?: string;
	resource?: string;
	tier?: string;
	current?: number;
	limit?: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
	await requireAuth(context, request);
	return {};
}

export default function CreateGroupPage() {
	const fetcher = useFetcher<CreateGroupResponse>({ key: "create-group" });
	const [dismissedUpgrade, setDismissedUpgrade] = useState(false);
	const isSubmitting = fetcher.state === "submitting";

	const isCapacityExceeded = fetcher.data?.error === "capacity_exceeded";
	const isCrewAtLimit =
		isCapacityExceeded && fetcher.data?.tier === "crew_member";
	const showUpgradePrompt =
		!dismissedUpgrade && isCapacityExceeded && !isCrewAtLimit;

	// Navigate via full reload on success so Better Auth's useListOrganizations
	// cache is re-fetched from the server before the hub renders.
	useEffect(() => {
		if (fetcher.data?.success) {
			window.location.href = "/hub";
		}
	}, [fetcher.data?.success]);

	// Reset dismissed state on each new submission
	useEffect(() => {
		if (fetcher.state === "submitting") setDismissedUpgrade(false);
	}, [fetcher.state]);

	return (
		<div className="max-w-2xl mx-auto">
			<HubHeader
				title="Create Group"
				subtitle="New Mission Control"
				showSearch={false}
			/>

			<div className="glass-panel rounded-xl p-4 md:p-8">
				<fetcher.Form
					method="post"
					action="/api/groups/create"
					className="space-y-6"
				>
					{fetcher.data?.error && !isCapacityExceeded && (
						<div className="p-4 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm font-medium">
							{fetcher.data.error}
						</div>
					)}

					{isCrewAtLimit && (
						<div className="p-4 bg-carbon/5 border border-carbon/10 rounded-lg text-sm">
							<p className="font-medium text-carbon">5-group limit reached</p>
							<p className="text-muted mt-1">
								Your Crew plan supports up to {fetcher.data?.limit ?? 5} groups.
								Visit{" "}
								<Link
									to="/hub/pricing"
									className="text-hyper-green font-medium underline underline-offset-2"
								>
									pricing
								</Link>{" "}
								for details on available plans.
							</p>
						</div>
					)}

					<div>
						<label
							htmlFor="name"
							className="block text-sm font-medium text-muted mb-2"
						>
							Group Name
						</label>
						<div className="relative">
							<input
								type="text"
								inputMode="text"
								name="name"
								id="name"
								required
								placeholder="e.g. Home, Office, Space Station 1"
								className="w-full bg-platinum/50 border border-carbon/10 rounded-lg px-4 py-3 text-carbon font-medium focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
							/>
						</div>
					</div>

					<div>
						<label
							htmlFor="slug"
							className="block text-sm font-medium text-muted mb-2"
						>
							Unique ID (Slug)
						</label>
						<div className="relative">
							<input
								type="text"
								inputMode="text"
								name="slug"
								id="slug"
								required
								placeholder="e.g. home-kitchen-1"
								className="w-full bg-platinum/50 border border-carbon/10 rounded-lg px-4 py-3 text-carbon font-medium focus:outline-none focus:ring-2 focus:ring-hyper-green/50"
							/>
							<p className="text-xs text-muted mt-2">
								A unique identifier for your group URL (letters, numbers,
								hyphens only)
							</p>
						</div>
					</div>

					<div className="pt-4 flex justify-end gap-3">
						<a
							href="/hub"
							className="px-6 py-3 text-muted hover:text-carbon transition-colors text-sm font-medium"
						>
							Cancel
						</a>
						<button
							type="submit"
							disabled={isSubmitting}
							className="px-6 py-3 bg-hyper-green text-carbon font-bold rounded-lg shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50"
						>
							{isSubmitting ? "Creating..." : "Create Group"}
						</button>
					</div>
				</fetcher.Form>
			</div>

			<UpgradePrompt
				open={showUpgradePrompt}
				onClose={() => setDismissedUpgrade(true)}
				title="Crew Member required"
				description="Creating additional groups requires a Crew Member subscription. Upgrade to unlock multiple groups and invite members."
			/>
		</div>
	);
}
