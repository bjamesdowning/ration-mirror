import { useState } from "react";
import { AGENT_SETUP_PROMPT } from "~/lib/agent-setup";

export function CopyPromptButton() {
	const [copied, setCopied] = useState(false);

	async function onCopy() {
		try {
			await navigator.clipboard.writeText(AGENT_SETUP_PROMPT);
			setCopied(true);
		} catch {
			setCopied(false);
		}
	}

	return (
		<button
			type="button"
			className="splash-copy-prompt"
			onClick={() => void onCopy()}
			aria-live="polite"
		>
			{copied ? "Prompt copied" : "Copy prompt"}
		</button>
	);
}
