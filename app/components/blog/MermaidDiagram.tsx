import { useEffect, useId, useRef, useState } from "react";

type MermaidAPI = {
	initialize: (config: Record<string, unknown>) => void;
	render: (id: string, source: string) => Promise<{ svg: string }>;
};

declare global {
	interface Window {
		mermaid?: MermaidAPI;
	}
}

const MERMAID_CDN =
	"https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.min.js";

let mermaidLoader: Promise<MermaidAPI> | null = null;

function loadMermaid(): Promise<MermaidAPI> {
	if (window.mermaid) {
		return Promise.resolve(window.mermaid);
	}

	mermaidLoader ??= new Promise((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(
			'script[data-mermaid-cdn="true"]',
		);
		if (existing) {
			existing.addEventListener("load", () => {
				if (window.mermaid) resolve(window.mermaid);
				else reject(new Error("Mermaid failed to load"));
			});
			existing.addEventListener("error", () =>
				reject(new Error("Mermaid script failed")),
			);
			return;
		}

		const script = document.createElement("script");
		script.src = MERMAID_CDN;
		script.async = true;
		script.dataset.mermaidCdn = "true";
		script.onload = () => {
			if (window.mermaid) resolve(window.mermaid);
			else reject(new Error("Mermaid failed to load"));
		};
		script.onerror = () => reject(new Error("Mermaid script failed"));
		document.head.appendChild(script);
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

	useEffect(() => {
		let cancelled = false;

		async function renderDiagram() {
			try {
				const mermaid = await loadMermaid();
				mermaid.initialize({
					startOnLoad: false,
					theme: "base",
					themeVariables: {
						primaryColor: "#F8F9FA",
						primaryTextColor: "#111111",
						primaryBorderColor: "#00E088",
						lineColor: "#00E088",
						secondaryColor: "#E6E6E6",
						tertiaryColor: "#F8F9FA",
						fontFamily: "'Space Mono', ui-monospace, monospace",
					},
					flowchart: { curve: "basis" },
					sequence: { actorMargin: 50 },
				});

				const { svg } = await mermaid.render(
					`mermaid-${diagramId}`,
					source.trim(),
				);

				if (!cancelled && containerRef.current) {
					containerRef.current.innerHTML = svg;
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
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
		<div
			ref={containerRef}
			role="img"
			className="my-6 rounded-xl border border-hyper-green/15 bg-ceramic p-6 overflow-x-auto [&_svg]:max-w-full"
			aria-label="Diagram"
		/>
	);
}
