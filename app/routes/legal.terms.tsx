import { LegalMarkdown } from "~/components/legal/LegalMarkdown";
import { JsonLd } from "~/components/seo/JsonLd";
import { canonicalMeta, ogMeta } from "~/lib/seo";
import { breadcrumbSchema, webPageSchema } from "~/lib/structured-data";
import { CURRENT_TOS_VERSION } from "~/lib/tos.constants";
import termsMd from "../../docs/legal/terms.md?raw";
import type { Route } from "./+types/legal.terms";

const TOS_DATE = CURRENT_TOS_VERSION;

export const meta: Route.MetaFunction = () => {
	const title = "Terms of Service | Ration";
	const description = "Terms of Service for the Ration platform.";
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta("/legal/terms"),
		...ogMeta({ title, description, path: "/legal/terms" }),
	];
};

const schemas = [
	webPageSchema({
		name: "Terms of Service",
		description: "Terms of Service for the Ration platform.",
		path: "/legal/terms",
		dateModified: TOS_DATE,
	}),
	breadcrumbSchema([
		{ name: "Home", path: "/" },
		{ name: "Legal", path: "/legal/terms" },
		{ name: "Terms of Service", path: "/legal/terms" },
	]),
];

export default function TermsOfService() {
	return (
		<>
			<JsonLd data={schemas} />
			<p className="text-sm text-muted mb-8 glass-panel rounded-lg p-4 not-prose">
				Last Updated: July 15, 2026
			</p>
			<div className="prose-article max-w-none">
				<LegalMarkdown content={termsMd} />
			</div>
		</>
	);
}
