import { useFetcher } from "react-router";
import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { requireAuth } from "~/lib/auth.server";
import type { Route } from "./+types/groups.new";

export async function loader({ request, context }: Route.LoaderArgs) {
	await requireAuth(context, request);
	return {};
}

export default function CreateGroupPage() {
	const fetcher = useFetcher<{ error?: string }>();
	const isSubmitting = fetcher.state === "submitting";

	return (
		<div className="max-w-2xl mx-auto">
			<DashboardHeader
				title="Create Group"
				subtitle="New Mission Control"
				showSearch={false}
			/>

			<div className="glass-panel rounded-xl p-8">
				<fetcher.Form method="post" action="/api/groups/create" className="space-y-6">
					{fetcher.data?.error && (
						<div className="p-4 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm font-medium">
							{fetcher.data.error}
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
							href="/dashboard"
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
		</div>
	);
}
