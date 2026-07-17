import { LegalMarkdown } from "~/components/legal/LegalMarkdown";
import { JsonLd } from "~/components/seo/JsonLd";
import { canonicalMeta, ogMeta } from "~/lib/seo";
import { breadcrumbSchema, webPageSchema } from "~/lib/structured-data";
import { CURRENT_TOS_VERSION } from "~/lib/tos.constants";
import privacyMd from "../../docs/legal/privacy.md?raw";
import type { Route } from "./+types/legal.privacy";

export const meta: Route.MetaFunction = () => {
	const title = "Privacy Policy | Ration";
	const description = "Privacy Policy for the Ration platform.";
	return [
		{ title },
		{ name: "description", content: description },
		canonicalMeta("/legal/privacy"),
		...ogMeta({ title, description, path: "/legal/privacy" }),
	];
};

const schemas = [
	webPageSchema({
		name: "Privacy Policy",
		description: "Privacy Policy for the Ration platform.",
		path: "/legal/privacy",
		dateModified: CURRENT_TOS_VERSION,
	}),
	breadcrumbSchema([
		{ name: "Home", path: "/" },
		{ name: "Legal", path: "/legal/privacy" },
		{ name: "Privacy Policy", path: "/legal/privacy" },
	]),
];

export default function PrivacyPolicy() {
	return (
		<>
			<JsonLd data={schemas} />
			<p className="text-sm text-muted mb-8 glass-panel rounded-lg p-4 not-prose">
				Last Updated: July 15, 2026
			</p>
			<div className="prose-article max-w-none">
				<LegalMarkdown content={privacyMd} />
			</div>
		</>
	);
}
