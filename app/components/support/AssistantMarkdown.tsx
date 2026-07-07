import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/cjs/styles/hljs";
import remarkGfm from "remark-gfm";

const orbitalTheme = {
	...atomOneDark,
	hljs: {
		...atomOneDark.hljs,
		background: "#0D0D0D",
		color: "#E6E6E6",
		padding: "1rem",
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

type AnchorProps = {
	href?: string;
	children?: ReactNode;
};

function isSafeHref(href: string): boolean {
	if (href.startsWith("/")) return true;
	try {
		const url = new URL(href);
		return url.protocol === "https:" || url.protocol === "mailto:";
	} catch {
		return false;
	}
}

function CodeBlock({ children, className, node, ...rest }: CodeProps) {
	const match = /language-(\w+)/.exec(className || "");
	const language = match ? match[1] : undefined;
	if (!language) {
		return (
			<code
				className="px-1.5 py-0.5 rounded bg-carbon/10 text-carbon font-mono text-[0.85em] border border-carbon/10"
				{...rest}
			>
				{children}
			</code>
		);
	}

	return (
		<div className="my-4 rounded-xl overflow-hidden border border-hyper-green/15">
			<SyntaxHighlighter
				style={orbitalTheme}
				language={language}
				PreTag="div"
				customStyle={{ margin: 0 }}
				{...rest}
			>
				{String(children).replace(/\n$/, "")}
			</SyntaxHighlighter>
		</div>
	);
}

function SafeAnchor({ href, children }: AnchorProps) {
	if (!href || !isSafeHref(href)) {
		return <span>{children}</span>;
	}
	return (
		<a
			href={href}
			rel="noreferrer"
			target={href.startsWith("/") ? undefined : "_blank"}
		>
			{children}
		</a>
	);
}

const COMPONENTS = {
	a: SafeAnchor,
	code: CodeBlock,
};

export function AssistantMarkdown({ content }: { content: string }) {
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
