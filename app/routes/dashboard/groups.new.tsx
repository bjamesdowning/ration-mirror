import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { requireActiveGroup } from "~/lib/auth.server";
import { authClient } from "~/lib/auth-client";
import type { Route } from "./+types/groups.new";

export async function loader({ request, context }: Route.LoaderArgs) {
	await requireActiveGroup(context, request);
	return {};
}

// Check client-side vs server-side creation
// Better Auth has client-side hooks nicely wrapped.
// But we can also do it via standard form submission if we want standard behavior.
// However, the Organization plugin is usually client driven for better-auth.
// Let's use a client-side interaction wrapped in a component page.

export default function CreateGroupPage() {
	return (
		<div className="max-w-2xl mx-auto">
			<DashboardHeader
				title="Create Group"
				subtitle="New Mission Control"
				showSearch={false}
			/>

			<div className="glass-panel rounded-xl p-8">
				<ClientCreateGroupForm />
			</div>
		</div>
	);
}

function ClientCreateGroupForm() {
	const { data: session } = authClient.useSession();

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const name = formData.get("name") as string;
		const slug = formData.get("slug") as string;

		await authClient.organization.create(
			{
				name,
				slug,
			},
			{
				onSuccess: (ctx) => {
					// Redirect to dashboard after creation (it auto-switches active org usually, or we might need to set it)
					// actually better-auth create doesn't always auto-switch.
					// Let's force switch.
					if (ctx.data?.id) {
						authClient.organization
							.setActive({
								organizationId: ctx.data.id,
							})
							.then(() => {
								window.location.href = "/dashboard";
							});
					}
				},
				onError: (ctx) => {
					alert(ctx.error.message);
				},
			},
		);
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
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
						A unique identifier for your group URL
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
					className="px-6 py-3 bg-hyper-green text-carbon font-bold rounded-lg shadow-glow-sm hover:shadow-glow transition-all"
				>
					Create Group
				</button>
			</div>
		</form>
	);
}
