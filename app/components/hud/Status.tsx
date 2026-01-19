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
			<div className="flex items-center gap-4 p-4 border-b border-[#39FF14]/20 bg-[#051105] text-[#39FF14] font-mono tracking-widest justify-end">
				<div className="animate-pulse">INITIALIZING...</div>
			</div>
		);
	}

	if (!session) {
		// If not signed in, maybe show nothing or Sign In button?
		// Root layout handles protection for dashboard, but public pages might show this.
		return null;
	}

	return (
		<div className="flex items-center gap-6 p-4 border-b border-[#39FF14]/20 bg-[#051105]/80 backdrop-blur-sm text-[#39FF14] font-mono justify-end">
			<div className="flex items-center gap-2">
				<div className="text-xs uppercase opacity-70">CREDITS</div>
				<div className="text-xl font-bold tabular-nums tracking-widest">
					{credits.toString().padStart(4, "0")}
				</div>
			</div>

			<div className="h-6 w-px bg-[#39FF14]/20" />

			<div className="flex items-center gap-4">
				<div className="flex items-center gap-2">
					{session.user.image && (
						<img
							src={session.user.image}
							alt={session.user.name || "User"}
							className="w-8 h-8 border border-[#39FF14]/50 object-cover"
						/>
					)}
					<span className="text-sm tracking-wide hidden md:block">
						{session.user.name || session.user.email}
					</span>
				</div>
				<button
					type="button"
					onClick={handleSignOut}
					className="text-xs uppercase border border-[#39FF14]/30 px-3 py-1 hover:bg-[#39FF14] hover:text-black transition-all cursor-pointer"
				>
					Log Out
				</button>
			</div>
		</div>
	);
}
