import { MealIcon } from "~/components/icons/HubIcons";

/**
 * Skeleton shown while meal match data (vector search) is loading.
 * Matches the layout of MealSuggestionsCard for minimal layout shift.
 */
export function MealWidgetSkeleton() {
	return (
		<div className="glass-panel rounded-xl p-6 animate-pulse">
			{/* Header */}
			<div className="flex items-start justify-between mb-6">
				<div className="flex items-center gap-2">
					<MealIcon className="opacity-50" />
					<div className="space-y-1">
						<div className="h-4 w-32 bg-platinum dark:bg-white/10 rounded" />
						<div className="h-3 w-48 bg-platinum dark:bg-white/10 rounded" />
					</div>
				</div>
			</div>

			{/* Placeholder cards grid */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-36 bg-platinum dark:bg-white/10 rounded-lg"
					/>
				))}
			</div>

			{/* Footer */}
			<div className="mt-6 pt-4 border-t border-carbon/10 flex justify-between">
				<div className="h-3 w-24 bg-platinum dark:bg-white/10 rounded" />
				<div className="h-3 w-28 bg-platinum dark:bg-white/10 rounded" />
			</div>
		</div>
	);
}
