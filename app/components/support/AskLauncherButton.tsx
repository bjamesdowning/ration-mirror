import { MessageCircle } from "lucide-react";

export function AskLauncherButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			className={[
				"group relative inline-flex min-h-[44px] max-w-[11rem] shrink-0 items-center justify-center gap-1.5",
				"rounded-lg px-2.5 md:px-3.5 text-sm font-semibold whitespace-nowrap transition-colors",
				"border border-hyper-green/80 bg-hyper-green text-carbon shadow-sm",
				"hover:border-hyper-green hover:bg-hyper-green/90 hover:brightness-[1.02]",
				"active:bg-hyper-green/85",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hyper-green focus-visible:ring-offset-2 focus-visible:ring-offset-ceramic",
				"dark:border-hyper-green dark:bg-hyper-green dark:text-carbon",
				"dark:hover:bg-hyper-green/90 dark:hover:brightness-[1.03]",
				"dark:focus-visible:ring-offset-carbon",
			].join(" ")}
			aria-label="Ask Ration"
			onClick={onClick}
		>
			<MessageCircle className="size-4 shrink-0 text-carbon" aria-hidden />
			<span className="hidden md:inline" aria-hidden>
				Ask Ration
			</span>
			<span className="md:hidden" aria-hidden>
				Ask
			</span>
		</button>
	);
}
