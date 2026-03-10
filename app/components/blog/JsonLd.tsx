/**
 * Renders JSON-LD structured data for SEO. Uses dangerouslySetInnerHTML
 * with JSON.stringify of controlled schema objects — safe, no user input.
 */
export function JsonLd({ data }: { data: object }) {
	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
		/>
	);
}
