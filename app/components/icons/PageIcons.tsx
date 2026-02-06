interface IconProps {
	className?: string;
}

/**
 * Simple icon components for page headers (without background circles)
 */

export function HomeIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<svg
			className={className}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-label="Home"
		>
			<title>Home</title>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
			/>
		</svg>
	);
}

export function PackageIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<svg
			className={className}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-label="Package"
		>
			<title>Package</title>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
			/>
		</svg>
	);
}

export function ChefHatIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<svg
			className={className}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-label="Chef Hat"
		>
			<title>Chef Hat</title>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"
			/>
		</svg>
	);
}

export function SearchIcon({ className = "w-5 h-5" }: IconProps) {
	return (
		<svg
			className={className}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-label="Search"
		>
			<title>Search</title>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
	);
}
