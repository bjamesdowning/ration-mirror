import { UserButton, useAuth } from "@clerk/react-router";

interface StatusProps {
	credits?: number;
}

export function Status({ credits = 0 }: StatusProps) {
	const { isLoaded, isSignedIn } = useAuth();

	if (!isLoaded || !isSignedIn) {
		return (
			<div className="flex items-center gap-4 p-4 border-b border-[#39FF14]/20 bg-[#051105] text-[#39FF14] font-mono tracking-widest justify-end">
				<div className="animate-pulse">INITIALIZING...</div>
			</div>
		);
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

			<div className="flex items-center">
				<UserButton
					appearance={{
						elements: {
							avatarBox:
								"w-8 h-8 rounded-none border border-[#39FF14]/50 hover:border-[#39FF14] transition-colors",
							userButtonPopoverCard:
								"rounded-none border border-[#39FF14]/20 bg-[#051105] text-[#39FF14]",
							userButtonPopoverActionButton:
								"hover:bg-[#39FF14]/10 rounded-none",
							userButtonPopoverActionButtonText: "text-[#39FF14] font-mono",
						},
					}}
				/>
			</div>
		</div>
	);
}
