import type { ReactNode } from "react";

interface MobileAuthHandoffCardProps {
	title: string;
	body: string;
	primaryHref: string;
	primaryLabel?: string;
	secondaryHref?: string;
	secondaryLabel?: string;
	footnote?: ReactNode;
}

export function MobileAuthHandoffCard({
	title,
	body,
	primaryHref,
	primaryLabel = "Open Ration",
	secondaryHref,
	secondaryLabel = "Having trouble? Open with the app link instead",
	footnote,
}: MobileAuthHandoffCardProps) {
	return (
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<div className="w-full max-w-md glass-panel rounded-2xl p-8 shadow-xl text-center">
				<h1 className="text-display text-xl text-carbon mb-3">{title}</h1>
				<p className="text-sm text-muted mb-6 leading-relaxed">{body}</p>
				<a
					href={primaryHref}
					className="inline-flex items-center justify-center gap-2 w-full bg-hyper-green text-carbon font-bold py-3 px-6 rounded-xl hover:shadow-glow-sm transition-all focus-ring"
				>
					{primaryLabel}
				</a>
				{secondaryHref ? (
					<a
						href={secondaryHref}
						className="inline-flex items-center justify-center gap-2 w-full mt-3 text-sm text-muted underline focus-ring"
					>
						{secondaryLabel}
					</a>
				) : null}
				{footnote ? (
					<p className="text-xs text-muted mt-4 leading-relaxed">{footnote}</p>
				) : null}
			</div>
		</div>
	);
}
