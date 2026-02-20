interface IconProps {
	className?: string;
}

export function MealIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<div className="w-9 h-9 rounded-full bg-hyper-green/10 flex items-center justify-center shadow-glow-sm">
			<svg
				className={className}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-label="Meals"
			>
				<title>Meals</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M3 3h2l.4 2M7 13h10l2-2m0 0l-2-2m2 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6l2 2M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17"
				/>
			</svg>
		</div>
	);
}

export function AlertIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<div className="w-9 h-9 rounded-full bg-warning/10 flex items-center justify-center">
			<svg
				className={`${className} text-warning`}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-label="Alert"
			>
				<title>Alert</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
		</div>
	);
}

export function GroceryIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<div className="w-9 h-9 rounded-full bg-hyper-green/5 flex items-center justify-center">
			<svg
				className={`${className} text-hyper-green`}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-label="Supply"
			>
				<title>Supply</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
				/>
			</svg>
		</div>
	);
}

export function PantryIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<div className="w-9 h-9 rounded-full bg-platinum flex items-center justify-center">
			<svg
				className={`${className} text-carbon`}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-label="Cargo"
			>
				<title>Cargo</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
				/>
			</svg>
		</div>
	);
}

export function SuccessIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center">
			<svg
				className={`${className} text-success`}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-label="Success"
			>
				<title>Success</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		</div>
	);
}

export function ListIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<div className="w-9 h-9 rounded-full bg-muted/5 flex items-center justify-center">
			<svg
				className={`${className} text-muted`}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-label="List"
			>
				<title>List</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
				/>
			</svg>
		</div>
	);
}

export function RecipeIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<div className="w-12 h-12 rounded-full bg-muted/5 flex items-center justify-center">
			<svg
				className={`${className} w-6 h-6 text-muted`}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-label="Meal"
			>
				<title>Meal</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
				/>
			</svg>
		</div>
	);
}

export function ClockIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<div className="w-9 h-9 rounded-full bg-warning/5 flex items-center justify-center">
			<svg
				className={`${className} text-warning`}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-label="Time"
			>
				<title>Time</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		</div>
	);
}

export function CheckIcon({ className = "w-3 h-3" }: IconProps) {
	return (
		<svg
			className={`${className} text-success`}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-label="Complete"
		>
			<title>Complete</title>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={3}
				d="M5 13l4 4L19 7"
			/>
		</svg>
	);
}
