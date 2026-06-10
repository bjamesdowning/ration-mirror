import type { ReactNode } from "react";

type OAuthCardProps = {
	title: string;
	description?: ReactNode;
	error?: string | null;
	children?: ReactNode;
	maxWidth?: "md" | "lg";
};

export function OAuthCard({
	title,
	description,
	error,
	children,
	maxWidth = "lg",
}: OAuthCardProps) {
	const widthClass = maxWidth === "md" ? "max-w-md" : "max-w-lg";

	return (
		<div className="min-h-screen bg-ceramic flex items-center justify-center p-6">
			<div
				className={`w-full ${widthClass} glass-panel rounded-2xl p-8 shadow-sm`}
			>
				<h1 className="font-mono text-xl font-bold text-carbon mb-2">
					{title}
				</h1>
				{description ? (
					<div className="text-sm text-muted mb-6">{description}</div>
				) : null}

				{error ? (
					<p className="mb-4 text-sm text-danger" role="alert">
						{error}
					</p>
				) : null}

				{children}
			</div>
		</div>
	);
}
