import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitLegalSections } from "~/lib/legal/split-legal-sections";

type BlockquoteProps = {
	children?: ReactNode;
};

function Callout({ children }: BlockquoteProps) {
	return (
		<blockquote className="my-8 pl-5 border-l-2 border-hyper-green bg-hyper-green/[0.04] rounded-r-xl py-4 pr-5 text-muted leading-relaxed [&_p]:my-1.5 [&_strong]:text-carbon [&_ul]:my-2 [&_li]:my-0.5">
			{children}
		</blockquote>
	);
}

const COMPONENTS = {
	blockquote: Callout,
};

function MarkdownBody({ content }: { content: string }) {
	if (!content.trim()) return null;
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			// biome-ignore lint/suspicious/noExplicitAny: react-markdown components typing
			components={COMPONENTS as any}
		>
			{content}
		</ReactMarkdown>
	);
}

/** Renders compliance Markdown from `docs/legal/` (Terms, Privacy). */
export function LegalMarkdown({ content }: { content: string }) {
	const chunks = splitLegalSections(content);
	return (
		<>
			{chunks.map((chunk) => {
				if (chunk.kind === "section") {
					return (
						<section key={chunk.id} id={chunk.id}>
							<MarkdownBody content={chunk.content} />
						</section>
					);
				}
				const key = `md-${chunk.content.slice(0, 48)}`;
				return <MarkdownBody key={key} content={chunk.content} />;
			})}
		</>
	);
}
