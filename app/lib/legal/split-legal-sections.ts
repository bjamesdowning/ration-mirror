/**
 * Split compliance Markdown on `<!-- section:id -->` … `<!-- /section -->`
 * markers so routes can wrap anchors (e.g. `#trader-information`, `#allergen`).
 */

export type LegalChunk =
	| { kind: "markdown"; content: string }
	| { kind: "section"; id: string; content: string };

const SECTION_OPEN = /<!--\s*section:([\w-]+)\s*-->/g;
const SECTION_CLOSE = "<!-- /section -->";

export function splitLegalSections(content: string): LegalChunk[] {
	const chunks: LegalChunk[] = [];
	let cursor = 0;
	SECTION_OPEN.lastIndex = 0;
	let match = SECTION_OPEN.exec(content);
	while (match) {
		const start = match.index;
		if (start > cursor) {
			chunks.push({
				kind: "markdown",
				content: content.slice(cursor, start),
			});
		}
		const id = match[1];
		const bodyStart = match.index + match[0].length;
		const closeIdx = content.indexOf(SECTION_CLOSE, bodyStart);
		if (closeIdx === -1) {
			chunks.push({ kind: "markdown", content: content.slice(start) });
			return chunks;
		}
		chunks.push({
			kind: "section",
			id,
			content: content.slice(bodyStart, closeIdx).trim(),
		});
		cursor = closeIdx + SECTION_CLOSE.length;
		SECTION_OPEN.lastIndex = cursor;
		match = SECTION_OPEN.exec(content);
	}
	if (cursor < content.length) {
		chunks.push({ kind: "markdown", content: content.slice(cursor) });
	}
	return chunks;
}
