import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router";
import remarkGfm from "remark-gfm";
import { resolveHelpHref } from "~/lib/help/resolve-help-href";

type LinkProps = {
	href?: string;
	children?: ReactNode;
};

function HelpLink({ href, children }: LinkProps) {
	if (!href) return <>{children}</>;
	const resolved = resolveHelpHref(href);
	if (resolved.kind === "external") {
		return (
			<a href={resolved.href} target="_blank" rel="noopener noreferrer">
				{children}
			</a>
		);
	}
	if (resolved.kind === "internal") {
		return <Link to={resolved.to}>{children}</Link>;
	}
	return <span>{children}</span>;
}

const COMPONENTS = {
	a: HelpLink,
};

/** Renders product how-to Markdown from `docs/fin/` for `/help`. */
export function HelpMarkdown({ content }: { content: string }) {
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
