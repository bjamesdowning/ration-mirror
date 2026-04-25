/**
 * Renders JSON-LD structured data for SEO. Uses dangerouslySetInnerHTML
 * with JSON.stringify of controlled schema objects.
 *
 * Defense in depth: even though schema inputs are build-time content (blog
 * frontmatter, hardcoded org data), we escape the three sequences that could
 * break out of a <script> context — `<`, `>`, and `&` — using \uXXXX so the
 * payload remains valid JSON-LD that search engines can parse.
 *
 * Accepts a single schema object or an array of schemas; arrays are emitted
 * as multiple <script> tags so crawlers can parse them independently.
 */
function safeStringify(item: object): string {
	return JSON.stringify(item)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026");
}

export function JsonLd({ data }: { data: object | object[] }) {
	const items = Array.isArray(data) ? data : [data];
	return (
		<>
			{items.map((item, idx) => (
				<script
					// biome-ignore lint/suspicious/noArrayIndexKey: schema list is static within a render
					key={idx}
					type="application/ld+json"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: serialized JSON with <,>,& escaped to \uXXXX
					dangerouslySetInnerHTML={{ __html: safeStringify(item) }}
				/>
			))}
		</>
	);
}
