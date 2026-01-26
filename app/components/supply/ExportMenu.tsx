import { useState } from "react";

interface ExportMenuProps {
	listId: string;
}

export function ExportMenu({ listId }: ExportMenuProps) {
	const [isOpen, setIsOpen] = useState(false);

	const handleExport = (format: "text" | "markdown") => {
		// Trigger download via browser
		window.location.href = `/api/grocery-lists/${listId}/export?format=${format}`;
		setIsOpen(false);
	};

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2 px-4 py-2 border border-[#39FF14]/50 text-[#39FF14] hover:bg-[#39FF14]/10 font-mono text-sm uppercase transition-colors"
			>
				<svg
					className="w-4 h-4"
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
					<div
						className="fixed inset-0 z-10"
						onClick={() => setIsOpen(false)}
					/>

					{/* Dropdown */}
					<div className="absolute right-0 top-full mt-1 z-20 bg-[#051105] border border-[#39FF14]/50 min-w-[200px]">
						<button
							type="button"
							onClick={() => handleExport("text")}
							className="w-full px-4 py-3 text-left hover:bg-[#39FF14]/10 transition-colors flex items-center gap-3"
						>
							<span className="text-lg">📄</span>
							<div>
								<div className="font-mono text-sm uppercase">Plain Text</div>
								<div className="text-xs opacity-50">
									Simple checklist format
								</div>
							</div>
						</button>
						<button
							type="button"
							onClick={() => handleExport("markdown")}
							className="w-full px-4 py-3 text-left hover:bg-[#39FF14]/10 transition-colors flex items-center gap-3 border-t border-[#39FF14]/20"
						>
							<span className="text-lg">📝</span>
							<div>
								<div className="font-mono text-sm uppercase">Markdown</div>
								<div className="text-xs opacity-50">For notes apps</div>
							</div>
						</button>
					</div>
				</>
			)}
		</div>
	);
}
