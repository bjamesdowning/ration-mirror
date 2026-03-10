import { Link } from "react-router";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
} from "~/components/icons/PageIcons";

interface DetailNavRockerProps {
	prevId: string | null;
	nextId: string | null;
	basePath: string;
	tag?: string;
	domain?: string;
	itemLabel: string;
}

function buildSearchParams(tag?: string, domain?: string): string {
	const params = new URLSearchParams();
	if (tag) params.set("tag", tag);
	if (domain) params.set("domain", domain);
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}

export function DetailNavRocker({
	prevId,
	nextId,
	basePath,
	tag,
	domain,
	itemLabel,
}: DetailNavRockerProps) {
	const search = buildSearchParams(tag, domain);

	return (
		<nav
			className="flex items-center gap-1"
			aria-label={`Navigate ${itemLabel}s`}
		>
			{prevId ? (
				<Link
					to={`${basePath}/${prevId}${search}`}
					className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-hyper-green hover:bg-hyper-green/10 transition-colors"
					aria-label={`Previous ${itemLabel}`}
				>
					<ChevronLeftIcon className="w-5 h-5" />
				</Link>
			) : (
				<span
					role="img"
					aria-label={`No previous ${itemLabel}`}
					aria-disabled="true"
					className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-muted opacity-30 cursor-not-allowed pointer-events-none"
				>
					<ChevronLeftIcon className="w-5 h-5" />
				</span>
			)}
			{nextId ? (
				<Link
					to={`${basePath}/${nextId}${search}`}
					className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-muted hover:text-hyper-green hover:bg-hyper-green/10 transition-colors"
					aria-label={`Next ${itemLabel}`}
				>
					<ChevronRightIcon className="w-5 h-5" />
				</Link>
			) : (
				<span
					role="img"
					aria-label={`No next ${itemLabel}`}
					aria-disabled="true"
					className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-muted opacity-30 cursor-not-allowed pointer-events-none"
				>
					<ChevronRightIcon className="w-5 h-5" />
				</span>
			)}
		</nav>
	);
}
