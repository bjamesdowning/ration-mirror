// @ts-nocheck
// @ts-expect-error
import { useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";

interface StatusProps {
	credits?: number;
}

export function Status({ credits = 0 }: StatusProps) {
	const { data: session, isPending } = authClient.useSession();
	const navigate = useNavigate();

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					navigate("/sign-in");
				},
			},
		});
	};

	if (isPending) {
		return (
			<div className="flex items-center gap-4 p-4 border-b border-platinum bg-ceramic text-carbon font-mono tracking-widest justify-end">
				<div className="animate-pulse text-muted">INITIALIZING...</div>
			</div>
		);
	}

	if (!session) {
		// If not signed in, maybe show nothing or Sign In button?
		// Root layout handles protection for dashboard, but public pages might show this.
		return null;
	}

	return (
		<div className="flex items-center gap-6 p-4 border-b border-platinum bg-ceramic/80 backdrop-blur-sm text-carbon font-mono justify-end">
			<button
				type="button"
				onClick={() => navigate("/dashboard/credits")}
				className="flex items-center gap-2 hover:opacity-100 transition-opacity cursor-pointer group"
			>
				<div className="text-xs uppercase text-muted group-hover:text-carbon">
					CREDITS
				</div>
				<div className="text-xl font-bold tabular-nums tracking-widest text-hyper-green">
					{credits.toString().padStart(4, "0")}
				</div>
				<div className="text-xs text-muted group-hover:text-carbon">+</div>
			</button>

			<div className="h-6 w-px bg-platinum" />

			<div className="flex items-center gap-4">
				<div className="flex items-center gap-2">
					{session.user.image && (
						<img
							src={session.user.image}
							alt={session.user.name || "User"}
							className="w-8 h-8 rounded-full border border-platinum object-cover"
						/>
					)}
					<span className="text-sm tracking-wide hidden md:block text-carbon">
						{session.user.name || session.user.email}
					</span>
				</div>
				<button
					type="button"
					onClick={handleSignOut}
					className="text-xs uppercase border border-platinum px-3 py-1 rounded-lg text-muted hover:bg-hyper-green hover:text-carbon hover:border-hyper-green transition-all cursor-pointer"
				>
					Log Out
				</button>
			</div>
		</div>
	);
}
