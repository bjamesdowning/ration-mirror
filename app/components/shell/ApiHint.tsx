import { Link } from "react-router";
import { CodeIcon } from "~/components/icons/PageIcons";

interface ApiHintProps {
	variant: "icon" | "menu-item";
	onClick?: () => void;
}

export function ApiHint({ variant, onClick }: ApiHintProps) {
	const baseUrl = "/hub/settings#api";

	if (variant === "icon") {
		return (
			<Link
				to={baseUrl}
				aria-label="API documentation"
				className="flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-hyper-green hover:bg-hyper-green/10 transition-colors"
			>
				<CodeIcon className="w-4 h-4" />
			</Link>
		);
	}

	// menu-item: for ExportMenu
	return (
		<Link
			to={baseUrl}
			onClick={onClick}
			className="w-full px-4 py-2 rounded-lg text-left text-carbon hover:bg-platinum cursor-pointer transition-colors flex items-center gap-3"
		>
			<CodeIcon className="w-5 h-5 text-muted shrink-0" />
			<div>
				<div className="text-sm text-carbon">Via API</div>
				<div className="text-xs text-muted">Programmatic access — Settings</div>
			</div>
		</Link>
	);
}
