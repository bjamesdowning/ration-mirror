import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/cjs/styles/hljs";
import remarkGfm from "remark-gfm";

// Custom dark theme aligned to Orbital Luxury palette
const orbitalTheme = {
	...atomOneDark,
	hljs: {
		...atomOneDark.hljs,
		background: "#0D0D0D",
		color: "#E6E6E6",
		padding: "1.25rem",
		borderRadius: "0.75rem",
		fontSize: "0.85rem",
		lineHeight: "1.6",
		fontFamily: "'Space Mono', ui-monospace, monospace",
		border: "1px solid rgba(0,224,136,0.15)",
	},
	"hljs-keyword": { color: "#00E088" },
	"hljs-string": { color: "#a8ff78" },
	"hljs-attr": { color: "#00E088" },
	"hljs-number": { color: "#79c0ff" },
	"hljs-comment": { color: "#6B7280", fontStyle: "italic" },
	"hljs-title": { color: "#f0a050" },
	"hljs-built_in": { color: "#79c0ff" },
};

type CodeProps = {
	children?: ReactNode;
	className?: string;
	// biome-ignore lint/suspicious/noExplicitAny: react-markdown node type
	node?: any;
	[key: string]: unknown;
};

function CodeBlock({ children, className, node, ...rest }: CodeProps) {
	const match = /language-(\w+)/.exec(className || "");
	const language = match ? match[1] : undefined;
	const isBlock = !!language;

	if (isBlock) {
		return (
			<div className="my-6 rounded-xl overflow-hidden border border-hyper-green/15 shadow-lg">
				{language && (
					<div className="flex items-center gap-2 px-4 py-2 bg-carbon/95 border-b border-hyper-green/10">
						<span className="w-2 h-2 rounded-full bg-hyper-green/60" />
						<span className="text-xs font-mono text-muted uppercase tracking-widest">
							{language}
						</span>
					</div>
				)}
				<SyntaxHighlighter
					style={orbitalTheme}
					language={language}
					PreTag="div"
					customStyle={{
						margin: 0,
						borderRadius: language ? "0 0 0.75rem 0.75rem" : "0.75rem",
					}}
					{...rest}
				>
					{String(children).replace(/\n$/, "")}
				</SyntaxHighlighter>
			</div>
		);
	}

	return (
		<code
			className="px-1.5 py-0.5 rounded bg-carbon/10 text-carbon font-mono text-[0.85em] border border-carbon/10"
			{...rest}
		>
			{children}
		</code>
	);
}

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
	code: CodeBlock,
	blockquote: Callout,
};

export function BlogMarkdown({ content }: { content: string }) {
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
