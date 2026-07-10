import { useEffect, useId, useRef, useState } from "react";

const MERMAID_THEME = {
	startOnLoad: false,
	theme: "base" as const,
	themeVariables: {
		primaryColor: "#F8F9FA",
		primaryTextColor: "#111111",
		primaryBorderColor: "#00E088",
		lineColor: "#00E088",
		secondaryColor: "#E6E6E6",
		tertiaryColor: "#F8F9FA",
		fontFamily: "'Space Mono', ui-monospace, monospace",
	},
	flowchart: { curve: "basis" as const },
	sequence: { actorMargin: 50 },
};

type MermaidModule = typeof import("mermaid");

let mermaidLoader: Promise<MermaidModule["default"]> | null = null;
let mermaidInitialized = false;

async function loadMermaid() {
	mermaidLoader ??= import("mermaid").then((mod) => {
		const api = mod.default;
		if (!mermaidInitialized) {
			api.initialize(MERMAID_THEME);
			mermaidInitialized = true;
		}
		return api;
	});
	return mermaidLoader;
}

type MermaidDiagramProps = {
	source: string;
};

export function MermaidDiagram({ source }: MermaidDiagramProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const diagramId = useId().replace(/:/g, "");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		async function renderDiagram() {
			setLoading(true);
			setError(null);

			try {
				const mermaid = await loadMermaid();
				const { svg } = await mermaid.render(
					`mermaid-${diagramId}`,
					source.trim(),
				);

				if (!cancelled && containerRef.current) {
					containerRef.current.innerHTML = svg;
					setLoading(false);
				}
			} catch (err) {
				if (!cancelled) {
					setLoading(false);
					setError(
						err instanceof Error ? err.message : "Failed to render diagram",
					);
				}
			}
		}

		renderDiagram();

		return () => {
			cancelled = true;
		};
	}, [source, diagramId]);

	if (error) {
		return (
			<pre className="my-6 rounded-xl border border-carbon/15 bg-carbon/5 p-4 text-sm font-mono text-muted overflow-x-auto">
				{source}
			</pre>
		);
	}

	return (
		<div className="my-6 rounded-xl border border-hyper-green/15 bg-ceramic p-6 overflow-x-auto min-h-[4rem] relative">
			{loading ? (
				<p
					className="text-xs font-mono text-muted uppercase tracking-widest"
					aria-live="polite"
				>
					Rendering diagram…
				</p>
			) : null}
			<div
				ref={containerRef}
				role="img"
				className="[&_svg]:max-w-full"
				aria-label="Diagram"
				aria-busy={loading}
			/>
		</div>
	);
}
