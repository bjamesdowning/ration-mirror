import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

interface PaginationBarProps {
	/** Current 0-based page index */
	currentPage: number;
	/** Total number of items across all pages */
	totalItems: number;
	/** Number of items per page */
	pageSize: number;
	/** Label for items (e.g. "items", "meals") */
	itemLabel: string;
}

/**
 * Pagination controls with Previous/Next. Updates the `page` search param
 * while preserving other params (domain, tag, etc.).
 */
export function PaginationBar({
	currentPage,
	totalItems,
	pageSize,
	itemLabel,
}: PaginationBarProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();

	const totalPages = Math.ceil(totalItems / pageSize);
	if (totalPages <= 1) return null;

	const start = currentPage * pageSize + 1;
	const end = Math.min((currentPage + 1) * pageSize, totalItems);

	const goToPage = (page: number) => {
		const next = new URLSearchParams(searchParams);
		if (page === 0) {
			next.delete("page");
		} else {
			next.set("page", String(page));
		}
		navigate({ pathname: location.pathname, search: next.toString() });
	};

	return (
		<nav
			className="flex items-center justify-between gap-4 py-4 px-2"
			aria-label={`Pagination for ${itemLabel}`}
		>
			<p className="text-sm text-muted">
				{start}–{end} of {totalItems} {itemLabel}
			</p>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={() => goToPage(currentPage - 1)}
					disabled={currentPage === 0}
					className="flex items-center gap-1 px-3 py-2 rounded-lg bg-platinum/20 hover:bg-platinum/40 text-carbon disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					aria-label="Previous page"
				>
					<ChevronLeft className="w-4 h-4" />
					<span className="sr-only sm:inline">Previous</span>
				</button>
				<span className="text-sm text-muted font-mono px-2">
					Page {currentPage + 1} of {totalPages}
				</span>
				<button
					type="button"
					onClick={() => goToPage(currentPage + 1)}
					disabled={currentPage >= totalPages - 1}
					className="flex items-center gap-1 px-3 py-2 rounded-lg bg-platinum/20 hover:bg-platinum/40 text-carbon disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					aria-label="Next page"
				>
					<span className="sr-only sm:inline">Next</span>
					<ChevronRight className="w-4 h-4" />
				</button>
			</div>
		</nav>
	);
}
