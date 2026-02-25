import { useState } from "react";
import {
	DocumentEditIcon,
	DocumentTextIcon,
} from "~/components/icons/PageIcons";
import { ApiHint } from "~/components/shell/ApiHint";

interface ExportMenuProps {
	listId: string;
}

export function ExportMenu({ listId }: ExportMenuProps) {
	const [isOpen, setIsOpen] = useState(false);

	const handleExport = (format: "text" | "markdown") => {
		// Trigger download via browser
		window.location.href = `/api/supply-lists/${listId}/export?format=${format}`;
		setIsOpen(false);
	};

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2 px-3 py-2 bg-platinum text-carbon rounded-lg hover:bg-platinum/80 transition-colors"
			>
				<svg
					aria-hidden="true"
					className="w-4 h-4 text-muted"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
					/>
				</svg>
				Export
				<svg
					aria-hidden="true"
					className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>

			{isOpen && (
				<>
					{/* Backdrop */}
					<button
						type="button"
						className="fixed inset-0 z-10 w-full h-full cursor-default focus:outline-none"
						onClick={() => setIsOpen(false)}
						aria-label="Close menu"
					/>

					{/* Dropdown */}
					<div className="absolute right-0 top-full mt-1 z-20 glass-panel rounded-xl shadow-lg p-2 min-w-[160px]">
						<button
							type="button"
							onClick={() => handleExport("text")}
							className="w-full px-4 py-2 rounded-lg text-left text-carbon hover:bg-platinum cursor-pointer transition-colors flex items-center gap-3"
						>
							<DocumentTextIcon className="w-5 h-5 text-muted shrink-0" />
							<div>
								<div className="text-sm text-carbon">Plain Text</div>
								<div className="text-xs text-muted">
									Simple checklist format
								</div>
							</div>
						</button>
						<button
							type="button"
							onClick={() => handleExport("markdown")}
							className="w-full px-4 py-2 rounded-lg text-left text-carbon hover:bg-platinum cursor-pointer transition-colors flex items-center gap-3"
						>
							<DocumentEditIcon className="w-5 h-5 text-muted shrink-0" />
							<div>
								<div className="text-sm text-carbon">Markdown</div>
								<div className="text-xs text-muted">For notes apps</div>
							</div>
						</button>
						<ApiHint variant="menu-item" onClick={() => setIsOpen(false)} />
						<a
							href="https://www.walmart.com/cp/grocery/976759"
							target="_blank"
							rel="noreferrer"
							className="w-full px-4 py-2 rounded-lg text-left text-carbon hover:bg-platinum cursor-pointer transition-colors flex items-center gap-3"
						>
							<span className="w-5 h-5 text-muted shrink-0">🛒</span>
							<div>
								<div className="text-sm text-carbon">Order Groceries</div>
								<div className="text-xs text-muted">Open Walmart Grocery</div>
							</div>
						</a>
					</div>
				</>
			)}
		</div>
	);
}
