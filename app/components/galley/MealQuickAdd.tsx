import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

interface MealQuickAddProps {
	/** Callback when form is successfully submitted */
	onSuccess?: () => void;
}

/**
 * Inline quick-add form for creating meals.
 * Minimal form with name field - redirects to full edit page after creation.
 */
export function MealQuickAdd({ onSuccess }: MealQuickAddProps) {
	const fetcher = useFetcher();
	const formRef = useRef<HTMLFormElement>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);
	const isSubmitting = fetcher.state !== "idle";

	// Focus input on mount
	useEffect(() => {
		nameInputRef.current?.focus();
	}, []);

	// Handle successful submission
	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data && !fetcher.data?.error) {
			formRef.current?.reset();
			onSuccess?.();
		}
	}, [fetcher.state, fetcher.data, onSuccess]);

	return (
		<fetcher.Form
			ref={formRef}
			method="post"
			action="/dashboard/meals/new"
			className="space-y-4"
		>
			<div className="flex flex-col md:flex-row gap-4">
				{/* Name Input */}
				<div className="flex-1">
					<label
						htmlFor="quick-meal-name"
						className="block text-label text-muted mb-2 text-sm"
					>
						Meal Name
					</label>
					<input
						ref={nameInputRef}
						type="text"
						id="quick-meal-name"
						name="name"
						required
						placeholder="Enter meal name..."
						className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
					/>
				</div>

				{/* Description Input */}
				<div className="flex-1">
					<label
						htmlFor="quick-meal-description"
						className="block text-label text-muted mb-2 text-sm"
					>
						Description (optional)
					</label>
					<input
						type="text"
						id="quick-meal-description"
						name="description"
						placeholder="Brief description..."
						className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
					/>
				</div>

				{/* Servings */}
				<div className="w-24">
					<label
						htmlFor="quick-meal-servings"
						className="block text-label text-muted mb-2 text-sm"
					>
						Servings
					</label>
					<input
						type="number"
						id="quick-meal-servings"
						name="servings"
						defaultValue={2}
						min={1}
						className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
					/>
				</div>
			</div>

			{/* Tags */}
			<div>
				<label
					htmlFor="quick-meal-tags"
					className="block text-label text-muted mb-2 text-sm"
				>
					Tags (comma separated)
				</label>
				<input
					type="text"
					id="quick-meal-tags"
					name="tags"
					placeholder="e.g. breakfast, quick, vegetarian"
					className="w-full bg-platinum rounded-lg px-4 py-3 text-carbon placeholder:text-muted/50 focus:ring-2 focus:ring-hyper-green/50 focus:outline-none"
				/>
			</div>

			{/* Helper Text */}
			<p className="text-xs text-muted">
				Quick create a meal - you can add ingredients and directions after
				creation.
			</p>

			{/* Error Display */}
			{fetcher.data?.error && (
				<div className="bg-danger/10 text-danger text-sm px-4 py-2 rounded-lg">
					{fetcher.data.error}
				</div>
			)}

			{/* Submit Button */}
			<div className="flex justify-end">
				<button
					type="submit"
					disabled={isSubmitting}
					className="bg-hyper-green text-carbon font-bold px-6 py-3 rounded-lg shadow-glow-sm hover:shadow-glow transition-all disabled:opacity-50"
				>
					{isSubmitting ? "Creating..." : "Create Meal"}
				</button>
			</div>
		</fetcher.Form>
	);
}
