import { Link } from "react-router";

type BlogCTAProps = {
	title?: string;
	description?: string;
	to?: string;
	label?: string;
};

export function BlogCTA({
	title = "Try Ration",
	description = "Track your pantry, plan meals, and reduce waste.",
	to = "/",
	label = "Get started",
}: BlogCTAProps) {
	return (
		<div className="mt-12 p-6 rounded-xl border border-carbon/10 bg-carbon/[0.02]">
			<h3 className="text-display text-lg text-carbon mb-2">{title}</h3>
			<p className="text-sm text-muted mb-4">{description}</p>
			<Link
				to={to}
				className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-hyper-green text-carbon font-medium text-sm hover:opacity-90 transition-opacity"
			>
				{label}
			</Link>
		</div>
	);
}
