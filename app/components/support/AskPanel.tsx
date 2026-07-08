import { Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterSheet } from "~/components/shell/FilterSheet";
import { AssistantMarkdown } from "./AssistantMarkdown";

type CopilotStatus = {
	tier: string;
	freeConversationsRemaining: number;
	allowanceResetAt: string;
	creditBalance: number;
	autoDeductConsent: boolean;
	conversationFloorCost: number;
	sessionIdleMs: number;
	brackets: Array<{ maxTokens: number | null; credits: number }>;
};

type CopilotTokenResponse = {
	token: string;
	expiresAt: string;
};

type CopilotMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

type AgentUiMessage = {
	id: string;
	role: "user" | "assistant";
	parts: Array<{ type: "text"; text: string }>;
};

type CopilotEvent = {
	type: string;
	message?: CopilotMessage;
	messageId?: string;
	text?: string;
	status?: { toolCallId: string; toolName: string; label: string };
	blocked?: { feature: string; message: string; deepLink: string };
	error?: { code: string; message: string } | boolean;
	approvalId?: string;
	toolName?: string;
	title?: string;
	id?: string;
	body?: string;
	done?: boolean;
};

type ApprovalRequest = {
	toolCallId: string;
	toolName: string;
};

type AskPanelProps = {
	isOpen: boolean;
	onClose: () => void;
};

function copilotSocketUrl(conversationId: string): string {
	const configured = import.meta.env.VITE_COPILOT_WS_URL as string | undefined;
	if (configured) return `${configured.replace(/\/$/, "")}/${conversationId}`;
	return `wss://copilot.ration.mayutic.com/copilot/${conversationId}`;
}

function toAgentMessages(messages: CopilotMessage[]): AgentUiMessage[] {
	return messages.map((message) => ({
		id: message.id,
		role: message.role,
		parts: [{ type: "text", text: message.content }],
	}));
}

function webBlockedHref(blocked: NonNullable<CopilotEvent["blocked"]>): string {
	switch (blocked.feature) {
		case "scan":
			return "/hub/cargo";
		case "generate_meal":
		case "import_url":
			return "/hub/galley";
		case "plan_week":
			return "/hub/manifest";
	}
	return "/hub";
}

export function AskPanel({ isOpen, onClose }: AskPanelProps) {
	const [status, setStatus] = useState<CopilotStatus | null>(null);
	const [messages, setMessages] = useState<CopilotMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [toolLabel, setToolLabel] = useState<string | null>(null);
	const [blocked, setBlocked] = useState<CopilotEvent["blocked"] | null>(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [needsConsent, setNeedsConsent] = useState(false);
	const [approval, setApproval] = useState<ApprovalRequest | null>(null);
	const [conversationId, setConversationId] = useState(() =>
		crypto.randomUUID(),
	);
	const socketRef = useRef<WebSocket | null>(null);
	const connectPromiseRef = useRef<Promise<WebSocket> | null>(null);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);

	const canSend = draft.trim().length > 0 && !isConnecting;
	const socketUrl = useMemo(
		() => copilotSocketUrl(conversationId),
		[conversationId],
	);
	const needsAutoDeductConsent =
		status?.tier === "crew_member" &&
		status.freeConversationsRemaining <= 0 &&
		!status.autoDeductConsent;

	useEffect(() => {
		if (!isOpen) return;
		let cancelled = false;
		void fetch("/api/copilot/status")
			.then((response) => {
				if (!response.ok) throw new Error("Unable to load copilot status.");
				return response.json() as Promise<CopilotStatus>;
			})
			.then((nextStatus) => {
				if (!cancelled) setStatus(nextStatus);
			})
			.catch((e) => {
				if (!cancelled)
					setError(e instanceof Error ? e.message : "Copilot unavailable.");
			});
		return () => {
			cancelled = true;
		};
	}, [isOpen]);

	const appendAssistant = useCallback((text: string) => {
		setMessages((current) => {
			const last = current[current.length - 1];
			if (last?.role === "assistant") {
				return [
					...current.slice(0, -1),
					{ ...last, content: `${last.content}${text}` },
				];
			}
			return [
				...current,
				{ id: crypto.randomUUID(), role: "assistant", content: text },
			];
		});
	}, []);

	const handleEvent = useCallback(
		(event: CopilotEvent) => {
			if (event.type === "cf_agent_use_chat_response") {
				if (event.error) {
					setError(
						typeof event.error === "object"
							? event.error.message
							: (event.body ?? "Copilot hit an error."),
					);
					return;
				}
				if (!event.body || event.done) return;
				const chunk = JSON.parse(event.body) as {
					type: string;
					id?: string;
					delta?: string;
					text?: string;
					toolName?: string;
					toolCallId?: string;
				};
				switch (chunk.type) {
					case "text-delta":
						appendAssistant(chunk.delta ?? chunk.text ?? "");
						break;
					case "tool-input-start":
					case "tool-input-available":
						setToolLabel(chunk.toolName ?? "Running tool");
						break;
					case "tool-output-available":
					case "tool-output-error":
					case "tool-output-denied":
					case "finish":
						setToolLabel(null);
						break;
					case "approval-requested":
						if (chunk.toolCallId) {
							setApproval({
								toolCallId: chunk.toolCallId,
								toolName: chunk.toolName ?? "Copilot action",
							});
						}
						break;
				}
				return;
			}

			switch (event.type) {
				case "message_start":
					if (event.message) {
						const message = event.message;
						setMessages((current) => [...current, message]);
					}
					break;
				case "text_delta":
					appendAssistant(event.text ?? "");
					break;
				case "tool_start":
					setToolLabel(
						event.status?.label ?? event.status?.toolName ?? "Running tool",
					);
					break;
				case "tool_end":
					setToolLabel(null);
					break;
				case "blocked_feature":
					setBlocked(event.blocked ?? null);
					break;
				case "approval_request":
					setApproval(
						event.approvalId
							? {
									toolCallId: event.approvalId,
									toolName: event.title ?? event.toolName ?? "Copilot action",
								}
							: null,
					);
					break;
				case "error":
					setError(
						typeof event.error === "object"
							? event.error.message
							: (event.text ?? "Copilot hit an error."),
					);
					break;
			}
		},
		[appendAssistant],
	);

	const connectSocket = useCallback(async (): Promise<WebSocket> => {
		const existing = socketRef.current;
		if (existing?.readyState === WebSocket.OPEN) return existing;
		if (connectPromiseRef.current) return connectPromiseRef.current;

		setIsConnecting(true);
		const promise = (async () => {
			const response = await fetch("/api/copilot/token", { method: "POST" });
			if (!response.ok) throw new Error("Unable to open copilot session.");
			const { token } = (await response.json()) as CopilotTokenResponse;
			const url = new URL(socketUrl);
			url.searchParams.set("handshakeToken", token);

			const socket = new WebSocket(url.toString());
			socketRef.current = socket;
			socket.onmessage = (event) => {
				try {
					const parsed = JSON.parse(String(event.data)) as CopilotEvent;
					handleEvent(parsed);
				} catch {
					setError("Copilot sent an unsupported message.");
				}
			};
			socket.onerror = () => setError("Copilot connection failed.");
			socket.onclose = () => {
				if (socketRef.current === socket) socketRef.current = null;
			};

			await new Promise<void>((resolve, reject) => {
				socket.onopen = () => resolve();
				socket.onerror = () => {
					setError("Copilot connection failed.");
					reject(new Error("Copilot connection failed."));
				};
				socket.onclose = () => {
					if (socketRef.current === socket) socketRef.current = null;
					reject(new Error("Copilot connection closed."));
				};
			});
			return socket;
		})().finally(() => {
			connectPromiseRef.current = null;
			setIsConnecting(false);
		});
		connectPromiseRef.current = promise;
		return promise;
	}, [socketUrl, handleEvent]);

	useEffect(() => {
		if (isOpen) return;
		socketRef.current?.close();
		socketRef.current = null;
		connectPromiseRef.current = null;
	}, [isOpen]);

	useEffect(() => {
		return () => {
			socketRef.current?.close();
			socketRef.current = null;
			connectPromiseRef.current = null;
		};
	}, []);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "end",
		});
	});

	async function send() {
		const text = draft.trim();
		if (!text || isConnecting) return;
		if (needsAutoDeductConsent) {
			setNeedsConsent(true);
			setError(null);
			return;
		}
		const message: CopilotMessage = {
			id: crypto.randomUUID(),
			role: "user",
			content: text,
		};
		const nextMessages = [...messages, message];
		setMessages(nextMessages);
		setDraft("");
		try {
			const socket = await connectSocket();
			// Think is server-authoritative: submitting a turn uses the AI SDK
			// "use chat request" envelope (a POST with the messages in the body),
			// not a flat "cf_agent_chat_messages" transcript overwrite (which the
			// server ignores).
			socket.send(
				JSON.stringify({
					type: "cf_agent_use_chat_request",
					id: crypto.randomUUID(),
					init: {
						method: "POST",
						body: JSON.stringify({
							messages: toAgentMessages(nextMessages),
							trigger: "submit-message",
						}),
					},
				}),
			);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Unable to open copilot session.",
			);
			setMessages(messages);
			setDraft(text);
		}
	}

	function newChat() {
		socketRef.current?.close();
		socketRef.current = null;
		connectPromiseRef.current = null;
		setConversationId(crypto.randomUUID());
		setMessages([]);
		setBlocked(null);
		setNeedsConsent(false);
		setApproval(null);
		setError(null);
		setToolLabel(null);
	}

	function approveTool(approved: boolean) {
		if (!approval) return;
		socketRef.current?.send(
			JSON.stringify({
				type: "cf_agent_tool_approval",
				toolCallId: approval.toolCallId,
				approved,
				autoContinue: true,
			}),
		);
		setApproval(null);
	}

	async function enableAutoDeduct() {
		try {
			const response = await fetch("/api/copilot/consent", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ autoDeductConsent: true }),
			});
			if (!response.ok) throw new Error("Unable to update copilot consent.");
			setStatus((await response.json()) as CopilotStatus);
			setNeedsConsent(false);
			setError(null);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Unable to update copilot consent.",
			);
		}
	}

	return (
		<FilterSheet isOpen={isOpen} onClose={onClose} title="Ask Ration">
			<div className="flex h-[70vh] flex-col gap-3">
				<div className="rounded-2xl border border-platinum/70 bg-white/70 p-3 text-sm text-muted dark:border-white/10 dark:bg-white/[0.06]">
					{status ? (
						<div className="flex items-center justify-between gap-3">
							<span>
								{status.freeConversationsRemaining > 0
									? `${status.freeConversationsRemaining} free chats today`
									: `${status.conversationFloorCost} credit floor per new chat`}
							</span>
							<span className="rounded-full bg-hyper-green/15 px-2 py-1 font-mono text-hyper-green">
								{status.creditBalance} cr
							</span>
						</div>
					) : (
						"Loading copilot status..."
					)}
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-platinum/70 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.04]">
					{messages.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
							<Sparkles className="size-8 text-hyper-green" />
							<p className="max-w-sm">
								Ask about Ration, inspect Cargo, or make deterministic pantry
								updates. Scans and generation stay in native flows.
							</p>
						</div>
					) : (
						<div className="space-y-3">
							{messages.map((message) => (
								<div
									key={message.id}
									className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
								>
									<div
										className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${
											message.role === "user"
												? "bg-hyper-green text-carbon"
												: "bg-ceramic text-carbon border border-platinum/70"
										}`}
									>
										{message.role === "assistant" ? (
											<AssistantMarkdown content={message.content} />
										) : (
											message.content
										)}
									</div>
								</div>
							))}
							<div ref={messagesEndRef} />
						</div>
					)}
				</div>

				{toolLabel ? (
					<div className="rounded-xl border border-hyper-green/25 bg-hyper-green/10 p-3 text-sm text-carbon">
						{toolLabel}
					</div>
				) : null}
				{blocked ? (
					<div className="rounded-xl border border-platinum bg-white/80 p-3 text-sm">
						<p className="font-semibold">Open native flow</p>
						<p className="text-muted">{blocked.message}</p>
						<a
							className="text-hyper-green underline"
							href={webBlockedHref(blocked)}
						>
							Continue
						</a>
					</div>
				) : null}
				{approval ? (
					<div className="rounded-xl border border-hyper-green/30 bg-hyper-green/10 p-3 text-sm">
						<p className="font-semibold">Confirm action</p>
						<p className="text-muted">
							Copilot wants to run `{approval.toolName}`.
						</p>
						<div className="mt-2 flex gap-2">
							<button
								type="button"
								onClick={() => approveTool(true)}
								className="rounded-full bg-hyper-green px-3 py-1 font-mono text-carbon text-xs uppercase tracking-[0.18em]"
							>
								Approve
							</button>
							<button
								type="button"
								onClick={() => approveTool(false)}
								className="rounded-full border border-platinum px-3 py-1 font-mono text-muted text-xs uppercase tracking-[0.18em]"
							>
								Deny
							</button>
						</div>
					</div>
				) : null}
				{needsConsent ? (
					<div className="rounded-xl border border-hyper-green/30 bg-hyper-green/10 p-3 text-sm">
						<p className="font-semibold">Use credits for Copilot?</p>
						<p className="text-muted">
							Your Crew allowance is used. Future Copilot chats can use the
							normal credit pool after confirmation.
						</p>
						<button
							type="button"
							onClick={() => void enableAutoDeduct()}
							className="mt-2 rounded-full bg-hyper-green px-3 py-1 font-mono text-carbon text-xs uppercase tracking-[0.18em]"
						>
							Allow credit use
						</button>
					</div>
				) : null}
				{error ? (
					<div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600">
						<span className="flex-1">{error}</span>
						<button type="button" onClick={() => setError(null)}>
							<X className="size-4" />
						</button>
					</div>
				) : null}

				<div className="flex items-end gap-2">
					<button
						type="button"
						onClick={newChat}
						className="rounded-xl border border-platinum px-3 py-2 text-sm text-muted"
					>
						New
					</button>
					<textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								void send();
							}
						}}
						rows={2}
						placeholder="Ask Ration..."
						className="min-h-[44px] flex-1 resize-none rounded-xl border border-platinum bg-white px-3 py-2 text-sm outline-none focus:border-hyper-green dark:border-white/10 dark:bg-white/[0.06]"
					/>
					<button
						type="button"
						disabled={!canSend}
						onClick={() => void send()}
						className="grid size-11 place-items-center rounded-xl bg-hyper-green text-carbon disabled:opacity-40"
					>
						<Send className="size-4" />
					</button>
				</div>
			</div>
		</FilterSheet>
	);
}
