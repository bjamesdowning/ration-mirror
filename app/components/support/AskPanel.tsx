import { ArrowDown, Info, Send, Sparkles, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouteLoaderData } from "react-router";
import { FilterSheet } from "~/components/shell/FilterSheet";
import {
	CopilotActivityIndicator,
	type TurnPhase,
} from "~/components/support/CopilotActivityIndicator";
import {
	type AgentResponseFrame,
	decodeAgentResponseFrame,
} from "~/lib/copilot/agent-frame.client";
import {
	buildCopilotContinuationDraft,
	formatCopilotTranscriptForCopy,
} from "~/lib/copilot/continuation";
import {
	clearCopilotSession,
	loadCopilotSession,
	resolveCopilotOrgHydration,
	touchCopilotSession,
} from "~/lib/copilot/session-storage.client";
import { formatCopilotTokenCount } from "~/lib/copilot/session-usage";
import { resolveCopilotToolEnd } from "~/lib/copilot/tool-event.client";
import {
	type CopilotTurnEvent,
	type CopilotTurnState,
	INITIAL_COPILOT_TURN_STATE,
	isCopilotTurnActive,
	reduceCopilotTurnState,
} from "~/lib/copilot/turn-lifecycle.client";
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

type CopilotSessionUsage = {
	totalTokens: number;
	maxTokens: number;
	messageCount: number;
	maxMessages: number;
	creditsCharged: number;
	creditBalance: number;
	nextBracketAt: number | null;
};

type CopilotSessionLimitWarning = {
	severity: "soft" | "urgent";
	message: string;
};

type CopilotEvent = {
	type: string;
	message?: CopilotMessage;
	messageId?: string;
	text?: string;
	status?: { toolCallId: string; toolName: string; label: string };
	toolCallId?: string;
	ok?: boolean;
	blocked?: { feature: string; message: string; deepLink: string };
	error?: { code: string; message: string } | boolean;
	approvalId?: string;
	toolName?: string;
	title?: string;
	id?: string;
	body?: string;
	done?: boolean;
	usage?: CopilotSessionUsage;
	warning?: CopilotSessionLimitWarning;
};

type ApprovalRequest = {
	toolCallId: string;
	toolName: string;
};

type RootLoaderSlice = {
	activeOrganizationId?: string | null;
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

function cancelCopilotRequest(
	socket: WebSocket | null,
	requestId: string | null,
): boolean {
	if (!socket || !requestId || socket.readyState !== WebSocket.OPEN) {
		return false;
	}
	try {
		socket.send(
			JSON.stringify({
				type: "cf_agent_chat_request_cancel",
				id: requestId,
			}),
		);
		return true;
	} catch {
		return false;
	}
}

function webBlockedHref(blocked: NonNullable<CopilotEvent["blocked"]>): string {
	switch (blocked.feature) {
		case "scan":
			return "/hub/cargo";
		case "import_url":
			return "/hub/galley";
	}
	return "/hub";
}

export function AskPanel({ isOpen, onClose }: AskPanelProps) {
	const root = useRouteLoaderData("root") as RootLoaderSlice | undefined;
	const organizationId = root?.activeOrganizationId ?? null;

	const [status, setStatus] = useState<CopilotStatus | null>(null);
	const [showPricingDetails, setShowPricingDetails] = useState(false);
	const [messages, setMessages] = useState<CopilotMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [needsCredits, setNeedsCredits] = useState<string | null>(null);
	const [limitReached, setLimitReached] = useState<string | null>(null);
	const [sessionUsage, setSessionUsage] = useState<CopilotSessionUsage | null>(
		null,
	);
	const [sessionLimitWarning, setSessionLimitWarning] =
		useState<CopilotSessionLimitWarning | null>(null);
	const [urgentWarningAcknowledged, setUrgentWarningAcknowledged] =
		useState(false);
	const [transcriptCopied, setTranscriptCopied] = useState(false);
	const [blocked, setBlocked] = useState<CopilotEvent["blocked"] | null>(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [needsConsent, setNeedsConsent] = useState(false);
	const [approval, setApproval] = useState<ApprovalRequest | null>(null);
	const [turnPhase, setTurnPhase] = useState<TurnPhase>("idle");
	const [turnState, setTurnState] = useState<CopilotTurnState>(
		INITIAL_COPILOT_TURN_STATE,
	);
	const [followsLatest, setFollowsLatest] = useState(true);
	const [activeToolName, setActiveToolName] = useState<string | null>(null);
	const [completedToolName, setCompletedToolName] = useState<string | null>(
		null,
	);
	const [toolSucceeded, setToolSucceeded] = useState<boolean | null>(null);
	const [conversationId, setConversationId] = useState<string>(() =>
		crypto.randomUUID(),
	);
	const socketRef = useRef<WebSocket | null>(null);
	const connectPromiseRef = useRef<Promise<WebSocket> | null>(null);
	const connectionGenerationRef = useRef(0);
	const transcriptRef = useRef<HTMLDivElement | null>(null);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const composerRef = useRef<HTMLTextAreaElement | null>(null);
	const toolLingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const stopFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const turnStateRef = useRef<CopilotTurnState>(INITIAL_COPILOT_TURN_STATE);
	const readTurnState = useCallback(
		(): CopilotTurnState => turnStateRef.current,
		[],
	);
	const handleEventRef = useRef<(event: CopilotEvent) => void>(() => undefined);
	const toolNameByCallIdRef = useRef(new Map<string, string>());
	const hydratedOrgRef = useRef<string | null>(null);

	const isTurnActive = isCopilotTurnActive(turnState);
	const isAwaitingApproval = turnState.status === "awaiting_approval";
	const isStopping = turnState.status === "stopping";
	const canSend =
		draft.trim().length > 0 &&
		!isConnecting &&
		!isTurnActive &&
		!isAwaitingApproval &&
		!limitReached &&
		!needsCredits &&
		!(sessionLimitWarning?.severity === "urgent" && !urgentWarningAcknowledged);
	const sessionUsagePercent = sessionUsage
		? Math.min(100, (sessionUsage.totalTokens / sessionUsage.maxTokens) * 100)
		: 0;
	const latestContentLength =
		messages[messages.length - 1]?.content.length ?? 0;
	const socketUrl = useMemo(
		() => copilotSocketUrl(conversationId),
		[conversationId],
	);
	const needsAutoDeductConsent =
		status?.tier === "crew_member" &&
		status.freeConversationsRemaining <= 0 &&
		!status.autoDeductConsent;

	const persistSession = useCallback(
		(nextMessages: CopilotMessage[], nextConversationId = conversationId) => {
			if (!organizationId) return;
			touchCopilotSession(organizationId, {
				conversationId: nextConversationId,
				messages: nextMessages,
			});
		},
		[conversationId, organizationId],
	);

	const clearToolLinger = useCallback(() => {
		if (toolLingerRef.current) {
			clearTimeout(toolLingerRef.current);
			toolLingerRef.current = null;
		}
	}, []);

	const clearStopFallback = useCallback(() => {
		if (stopFallbackRef.current) {
			clearTimeout(stopFallbackRef.current);
			stopFallbackRef.current = null;
		}
	}, []);

	const transitionTurn = useCallback((event: CopilotTurnEvent) => {
		const next = reduceCopilotTurnState(turnStateRef.current, event);
		turnStateRef.current = next;
		setTurnState(next);
		return next;
	}, []);

	const endTurn = useCallback(
		(options: { persist?: boolean; focus?: boolean } = {}) => {
			clearToolLinger();
			clearStopFallback();
			setActiveToolName(null);
			setCompletedToolName(null);
			setToolSucceeded(null);
			toolNameByCallIdRef.current.clear();
			setTurnPhase("idle");
			setApproval(null);
			transitionTurn({ type: "ended" });
			if (options.persist !== false) {
				setMessages((current) => {
					persistSession(current);
					return current;
				});
			}
			if (isOpen) {
				void fetch("/api/copilot/status")
					.then((response) => {
						if (!response.ok) throw new Error("Unable to load copilot status.");
						return response.json() as Promise<CopilotStatus>;
					})
					.then((nextStatus) => {
						setStatus(nextStatus);
					})
					.catch(() => undefined);
			}
			if (isOpen && options.focus !== false) {
				requestAnimationFrame(() => composerRef.current?.focus());
			}
		},
		[
			clearStopFallback,
			clearToolLinger,
			isOpen,
			persistSession,
			transitionTurn,
		],
	);

	const scheduleToolDoneLinger = useCallback(
		(toolName: string, succeeded: boolean) => {
			clearToolLinger();
			setActiveToolName(null);
			setCompletedToolName(toolName);
			setToolSucceeded(succeeded);
			setTurnPhase("tool_done");
			toolLingerRef.current = setTimeout(() => {
				setCompletedToolName(null);
				setToolSucceeded(null);
				setTurnPhase((current) =>
					current === "tool_done" ? "thinking" : current,
				);
			}, 800);
		},
		[clearToolLinger],
	);

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

	useEffect(() => {
		if (!isOpen) return;
		if (!organizationId || !status) return;
		if (hydratedOrgRef.current === organizationId) return;

		socketRef.current?.close();
		socketRef.current = null;
		connectPromiseRef.current = null;
		connectionGenerationRef.current += 1;
		clearToolLinger();
		clearStopFallback();
		transitionTurn({ type: "ended" });
		setTurnPhase("idle");

		const snapshot = loadCopilotSession(organizationId, status.sessionIdleMs);
		const hydration = resolveCopilotOrgHydration(snapshot);
		const clearSessionBillingState = () => {
			setNeedsCredits(null);
			setLimitReached(null);
			setSessionUsage(null);
			setSessionLimitWarning(null);
			setUrgentWarningAcknowledged(false);
			setTranscriptCopied(false);
		};
		if (hydration.kind === "restore") {
			setConversationId(hydration.conversationId);
			setMessages(hydration.messages);
			setBlocked(null);
			setNeedsConsent(false);
			setApproval(null);
			setError(null);
			clearSessionBillingState();
			setActiveToolName(null);
			setCompletedToolName(null);
			setToolSucceeded(null);
		} else {
			setConversationId(crypto.randomUUID());
			setMessages([]);
			setBlocked(null);
			setNeedsConsent(false);
			setApproval(null);
			setError(null);
			clearSessionBillingState();
			setActiveToolName(null);
			setCompletedToolName(null);
			setToolSucceeded(null);
		}
		hydratedOrgRef.current = organizationId;
	}, [
		clearStopFallback,
		clearToolLinger,
		isOpen,
		organizationId,
		status,
		transitionTurn,
	]);

	const appendAssistant = useCallback(
		(text: string) => {
			setMessages((current) => {
				const last = current[current.length - 1];
				const next =
					last?.role === "assistant"
						? [
								...current.slice(0, -1),
								{ ...last, content: `${last.content}${text}` },
							]
						: [
								...current,
								{
									id: crypto.randomUUID(),
									role: "assistant" as const,
									content: text,
								},
							];
				persistSession(next);
				return next;
			});
			setTurnPhase("streaming");
		},
		[persistSession],
	);

	const handleEvent = useCallback(
		(event: CopilotEvent) => {
			if (event.type === "cf_agent_use_chat_response") {
				const action = decodeAgentResponseFrame(event as AgentResponseFrame);
				if (
					turnStateRef.current.status === "idle" &&
					action.kind !== "turn_end"
				) {
					return;
				}
				switch (action.kind) {
					case "text_delta":
						appendAssistant(action.text);
						break;
					case "tool_start":
						clearToolLinger();
						setCompletedToolName(null);
						setToolSucceeded(null);
						setActiveToolName(action.toolName);
						setTurnPhase("tool_running");
						break;
					case "tool_end":
						scheduleToolDoneLinger(action.toolName, action.succeeded);
						break;
					case "turn_end":
						endTurn();
						break;
					case "approval_requested":
						setTurnPhase("idle");
						if (!action.toolCallId) {
							setError("Copilot sent an invalid approval request.");
							endTurn();
							break;
						}
						if (
							transitionTurn({ type: "approval_requested" }).status ===
							"awaiting_approval"
						) {
							setApproval({
								toolCallId: action.toolCallId,
								toolName: action.toolName,
							});
						}
						break;
					case "error":
						setError(action.message);
						endTurn();
						break;
					case "noop":
						break;
				}
				return;
			}

			switch (event.type) {
				case "message_start":
					if (event.message) {
						const message = event.message;
						setMessages((current) => {
							if (
								message.role === "assistant" &&
								current.some(
									(entry) =>
										entry.role === "assistant" && entry.id === message.id,
								)
							) {
								return current;
							}
							if (
								message.role === "assistant" &&
								current[current.length - 1]?.role === "assistant"
							) {
								return current;
							}
							const next = [...current, message];
							persistSession(next);
							return next;
						});
					}
					setTurnPhase("thinking");
					break;
				case "text_delta":
					appendAssistant(event.text ?? "");
					break;
				case "message_end":
					endTurn();
					break;
				case "tool_start":
					clearToolLinger();
					setCompletedToolName(null);
					setToolSucceeded(null);
					if (event.status) {
						toolNameByCallIdRef.current.set(
							event.status.toolCallId,
							event.status.toolName,
						);
					}
					setActiveToolName(
						event.status?.toolName ?? event.status?.label ?? "tool",
					);
					setTurnPhase("tool_running");
					break;
				case "tool_end": {
					const result = resolveCopilotToolEnd(
						event,
						toolNameByCallIdRef.current,
					);
					scheduleToolDoneLinger(result.toolName, result.succeeded);
					break;
				}
				case "blocked_feature":
					setBlocked(event.blocked ?? null);
					endTurn();
					break;
				case "session_usage_update":
					if (event.usage) {
						const usage = event.usage;
						setSessionUsage(usage);
						setStatus((current) =>
							current
								? { ...current, creditBalance: usage.creditBalance }
								: current,
						);
					}
					break;
				case "session_limit_warning":
					if (event.warning) {
						setSessionLimitWarning(event.warning);
						if (event.warning.severity === "urgent") {
							setUrgentWarningAcknowledged(false);
						}
					}
					break;
				case "approval_request":
					setTurnPhase("idle");
					if (!event.approvalId) {
						setError("Copilot sent an invalid approval request.");
						endTurn();
						break;
					}
					if (
						transitionTurn({ type: "approval_requested" }).status ===
						"awaiting_approval"
					) {
						setApproval({
							toolCallId: event.approvalId,
							toolName: event.title ?? event.toolName ?? "Copilot action",
						});
					}
					break;
				case "error":
					if (
						typeof event.error === "object" &&
						event.error?.code === "session_limit_reached"
					) {
						connectionGenerationRef.current += 1;
						socketRef.current?.close();
						socketRef.current = null;
						connectPromiseRef.current = null;
						clearToolLinger();
						setLimitReached(event.error.message);
						setError(null);
						setNeedsCredits(null);
						endTurn({ persist: true, focus: false });
						return;
					}
					if (
						typeof event.error === "object" &&
						event.error?.code === "insufficient_credits"
					) {
						setNeedsCredits(event.error.message);
						setError(null);
						endTurn({ persist: true, focus: false });
						return;
					}
					setError(
						typeof event.error === "object"
							? event.error.message
							: (event.text ?? "Copilot hit an error."),
					);
					endTurn();
					break;
			}
		},
		[
			appendAssistant,
			clearToolLinger,
			endTurn,
			persistSession,
			scheduleToolDoneLinger,
			transitionTurn,
		],
	);
	handleEventRef.current = handleEvent;

	const connectSocket = useCallback(async (): Promise<WebSocket> => {
		const existing = socketRef.current;
		if (existing?.readyState === WebSocket.OPEN) return existing;
		if (connectPromiseRef.current) return connectPromiseRef.current;

		setIsConnecting(true);
		setTurnPhase("connecting");
		const generation = connectionGenerationRef.current;
		const promise = (async () => {
			const response = await fetch("/api/copilot/token", { method: "POST" });
			if (!response.ok) throw new Error("Unable to open copilot session.");
			const { token } = (await response.json()) as CopilotTokenResponse;
			if (generation !== connectionGenerationRef.current) {
				throw new Error("Copilot connection cancelled.");
			}
			const url = new URL(socketUrl);
			url.searchParams.set("handshakeToken", token);

			const socket = new WebSocket(url.toString());
			socketRef.current = socket;

			await new Promise<void>((resolve, reject) => {
				socket.onopen = () => resolve();
				socket.onerror = () => {
					reject(new Error("Copilot connection failed."));
				};
				socket.onclose = () => {
					if (socketRef.current === socket) socketRef.current = null;
					reject(new Error("Copilot connection closed."));
				};
			});

			socket.onmessage = (event) => {
				try {
					const parsed = JSON.parse(String(event.data)) as CopilotEvent;
					handleEventRef.current(parsed);
				} catch {
					setError("Copilot sent an unsupported message.");
					endTurn();
				}
			};
			socket.onerror = () => {
				if (socketRef.current === socket) socketRef.current = null;
				setError("Copilot connection failed.");
				endTurn();
				socket.close();
			};
			socket.onclose = () => {
				if (socketRef.current === socket) socketRef.current = null;
				const status = turnStateRef.current.status;
				if (status === "idle") return;
				if (status === "stopping") {
					endTurn();
					return;
				}
				setError("Copilot disconnected. You can send your message again.");
				endTurn();
			};
			return socket;
		})().finally(() => {
			if (generation === connectionGenerationRef.current) {
				connectPromiseRef.current = null;
				setIsConnecting(false);
			}
		});
		connectPromiseRef.current = promise;
		return promise;
	}, [endTurn, socketUrl]);

	useEffect(() => {
		return () => {
			connectionGenerationRef.current += 1;
			clearToolLinger();
			clearStopFallback();
			const socket = socketRef.current;
			if (socket) {
				const { activeRequestId } = turnStateRef.current;
				cancelCopilotRequest(socket, activeRequestId);
				socket.onmessage = null;
				socket.onerror = null;
				socket.onclose = null;
				socket.close();
			}
			socketRef.current = null;
			connectPromiseRef.current = null;
		};
	}, [clearStopFallback, clearToolLinger]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: stream length and phase intentionally retrigger follow-latest scrolling
	useEffect(() => {
		if (!isOpen || !followsLatest) return;
		messagesEndRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "end",
		});
	}, [followsLatest, isOpen, latestContentLength, messages.length, turnPhase]);

	useEffect(() => {
		if (!isOpen) return;
		requestAnimationFrame(() => composerRef.current?.focus());
	}, [isOpen]);

	const handleTranscriptScroll = useCallback(() => {
		const transcript = transcriptRef.current;
		if (!transcript) return;
		const distanceFromBottom =
			transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
		setFollowsLatest(distanceFromBottom < 48);
	}, []);

	async function send() {
		const text = draft.trim();
		if (!text || isConnecting || readTurnState().status !== "idle") {
			return;
		}
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
		const requestId = crypto.randomUUID();
		transitionTurn({ type: "started", requestId });
		setTurnPhase("connecting");
		setActiveToolName(null);
		setCompletedToolName(null);
		setToolSucceeded(null);
		setBlocked(null);
		setError(null);
		setNeedsCredits(null);
		setLimitReached(null);
		setFollowsLatest(true);
		try {
			const socket = await connectSocket();
			const { activeRequestId: currentRequestId, status: currentStatus } =
				readTurnState();
			if (currentRequestId !== requestId || currentStatus !== "active") {
				if (socketRef.current === socket) {
					socketRef.current = null;
					socket.close();
				}
				return;
			}
			socket.send(
				JSON.stringify({
					type: "cf_agent_use_chat_request",
					id: requestId,
					init: {
						method: "POST",
						body: JSON.stringify({
							messages: toAgentMessages(nextMessages),
							trigger: "submit-message",
						}),
					},
				}),
			);
			setMessages(nextMessages);
			persistSession(nextMessages);
			setDraft("");
			setTurnPhase("thinking");
		} catch (e) {
			if (turnStateRef.current.activeRequestId !== requestId) return;
			endTurn();
			setError(
				e instanceof Error ? e.message : "Unable to open copilot session.",
			);
		}
	}

	function stopTurn() {
		const { activeRequestId, status: currentStatus } = turnStateRef.current;
		if (!activeRequestId || currentStatus !== "active") return;

		const socket = socketRef.current;
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			connectionGenerationRef.current += 1;
			connectPromiseRef.current = null;
			setIsConnecting(false);
			socket?.close();
			endTurn();
			return;
		}

		if (cancelCopilotRequest(socket, activeRequestId)) {
			transitionTurn({ type: "stop_requested" });
			clearStopFallback();
			stopFallbackRef.current = setTimeout(() => {
				endTurn();
			}, 2_000);
		} else {
			setError("Unable to stop Copilot. The connection was closed.");
			socket.close();
			endTurn();
		}
	}

	function resetConversationState(options?: { preserveDraft?: boolean }) {
		const { activeRequestId } = turnStateRef.current;
		cancelCopilotRequest(socketRef.current, activeRequestId);
		transitionTurn({ type: "ended" });
		connectionGenerationRef.current += 1;
		socketRef.current?.close();
		socketRef.current = null;
		connectPromiseRef.current = null;
		clearToolLinger();
		clearStopFallback();
		const nextConversationId = crypto.randomUUID();
		setConversationId(nextConversationId);
		setMessages([]);
		setBlocked(null);
		setNeedsConsent(false);
		setApproval(null);
		setError(null);
		setNeedsCredits(null);
		setLimitReached(null);
		setSessionUsage(null);
		setSessionLimitWarning(null);
		setUrgentWarningAcknowledged(false);
		setTranscriptCopied(false);
		setActiveToolName(null);
		setCompletedToolName(null);
		setToolSucceeded(null);
		setTurnPhase("idle");
		if (!options?.preserveDraft) {
			setDraft("");
		}
		if (organizationId) clearCopilotSession(organizationId);
	}

	function newChat() {
		resetConversationState();
	}

	async function copyTranscript() {
		if (messages.length === 0) return;
		const text = formatCopilotTranscriptForCopy(messages);
		try {
			await navigator.clipboard.writeText(text);
			setTranscriptCopied(true);
		} catch {
			setError("Unable to copy the transcript.");
		}
	}

	function continueInNewChat() {
		resetConversationState({ preserveDraft: true });
		setDraft(buildCopilotContinuationDraft());
		requestAnimationFrame(() => composerRef.current?.focus());
	}

	function approveTool(approved: boolean) {
		if (!approval) return;
		const socket = socketRef.current;
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			setApproval(null);
			setError("Copilot disconnected before the approval was sent.");
			endTurn();
			return;
		}
		try {
			socket.send(
				JSON.stringify({
					type: "cf_agent_tool_approval",
					toolCallId: approval.toolCallId,
					approved,
					autoContinue: true,
				}),
			);
			setApproval(null);
			transitionTurn({ type: "approval_resolved", approved });
			if (approved) {
				setTurnPhase("thinking");
			} else {
				endTurn();
			}
		} catch {
			setApproval(null);
			setError("Unable to send the approval response.");
			endTurn();
		}
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

	const displayToolName = completedToolName ?? activeToolName;
	const showThinking =
		turnPhase === "thinking" &&
		(messages.length === 0 ||
			messages[messages.length - 1]?.role !== "assistant" ||
			messages[messages.length - 1]?.content.length === 0);

	return (
		<FilterSheet isOpen={isOpen} onClose={onClose} title="Ask Ration">
			<div className="flex h-[70vh] flex-col gap-3">
				<div className="rounded-2xl border border-platinum/70 bg-white/70 p-3 text-sm text-muted dark:border-white/10 dark:bg-white/[0.06]">
					{status ? (
						<div className="space-y-2">
							<div className="flex items-center justify-between gap-3">
								<span className="flex items-center gap-2">
									{status.freeConversationsRemaining > 0
										? `${status.freeConversationsRemaining} free chats today`
										: `${status.conversationFloorCost} credit floor per new chat`}
									<button
										type="button"
										onClick={() => setShowPricingDetails((v) => !v)}
										aria-label={
											showPricingDetails
												? "Hide Copilot pricing details"
												: "Show Copilot pricing details"
										}
										className="grid size-6 place-items-center rounded-full border border-platinum/70 bg-white/80 text-muted hover:text-carbon dark:border-white/10 dark:bg-white/[0.04] dark:hover:text-white"
									>
										<Info className="size-3.5" />
									</button>
								</span>
								<span className="rounded-full bg-hyper-green/15 px-2 py-1 font-mono text-hyper-green">
									{status.creditBalance} cr
								</span>
							</div>
							{showPricingDetails ? (
								<div className="rounded-xl border border-platinum/70 bg-white/70 p-2 text-xs text-muted dark:border-white/10 dark:bg-white/[0.04]">
									<p className="font-mono uppercase tracking-[0.18em] text-[10px] text-muted">
										Pricing
									</p>
									<ul className="mt-1 space-y-1">
										{status.brackets.map((bracket) => (
											<li
												key={`${bracket.maxTokens ?? "max"}-${bracket.credits}`}
											>
												Up to {bracket.maxTokens?.toLocaleString()} tokens →{" "}
												{bracket.credits} cr
											</li>
										))}
									</ul>
									<p className="mt-2 text-[10px]">
										Each conversation is capped at 60,000 tokens. Start a new
										chat to reset the meter.
									</p>
								</div>
							) : null}
						</div>
					) : (
						"Loading copilot status..."
					)}
				</div>

				{sessionUsage ? (
					<div className="rounded-2xl border border-platinum/70 bg-white/70 p-3 text-xs text-muted dark:border-white/10 dark:bg-white/[0.06]">
						<div className="flex items-center justify-between gap-3 font-mono">
							<span>
								~{formatCopilotTokenCount(sessionUsage.totalTokens)} /{" "}
								{formatCopilotTokenCount(sessionUsage.maxTokens)} tokens
							</span>
							<span className="text-hyper-green">
								{sessionUsage.creditsCharged} cr this chat
							</span>
						</div>
						<div
							className="mt-2 h-1 overflow-hidden rounded-full bg-platinum/60 dark:bg-white/10"
							role="progressbar"
							aria-valuenow={Math.round(sessionUsagePercent)}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-label="Copilot session token usage"
						>
							<div
								className="h-full rounded-full bg-hyper-green transition-[width] duration-300"
								style={{ width: `${sessionUsagePercent}%` }}
							/>
						</div>
						{sessionUsage.nextBracketAt ? (
							<p className="mt-1 text-[10px]">
								Next bracket in ~
								{formatCopilotTokenCount(sessionUsage.nextBracketAt)} tokens
							</p>
						) : null}
					</div>
				) : null}

				{sessionLimitWarning ? (
					<div
						className={`rounded-xl border p-3 text-sm ${
							sessionLimitWarning.severity === "urgent"
								? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100"
								: "border-platinum/70 bg-white/70 text-muted dark:border-white/10 dark:bg-white/[0.04]"
						}`}
					>
						<p>{sessionLimitWarning.message}</p>
						{sessionLimitWarning.severity === "urgent" &&
						!urgentWarningAcknowledged ? (
							<div className="mt-2 flex flex-wrap gap-2">
								<button
									type="button"
									onClick={() => setUrgentWarningAcknowledged(true)}
									className="rounded-full border border-platinum px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] dark:border-white/10"
								>
									Continue anyway
								</button>
								<button
									type="button"
									onClick={newChat}
									className="rounded-full bg-hyper-green px-3 py-1 font-mono text-carbon text-xs uppercase tracking-[0.18em]"
								>
									New chat
								</button>
							</div>
						) : null}
					</div>
				) : null}

				<div
					ref={transcriptRef}
					onScroll={handleTranscriptScroll}
					role="log"
					aria-live="polite"
					aria-relevant="additions"
					aria-busy={isTurnActive}
					aria-label="Copilot conversation"
					className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-platinum/70 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.04]"
				>
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
							{messages.map((message, index) => (
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
											<span className="inline">
												<AssistantMarkdown content={message.content} />
												{turnPhase === "streaming" &&
												index === messages.length - 1 ? (
													<span
														className="ml-1 inline-block size-2 animate-pulse rounded-full bg-hyper-green align-middle"
														aria-hidden
													/>
												) : null}
											</span>
										) : (
											message.content
										)}
									</div>
								</div>
							))}
							<div ref={messagesEndRef} />
						</div>
					)}
					{!followsLatest && messages.length > 0 ? (
						<button
							type="button"
							onClick={() => {
								setFollowsLatest(true);
								messagesEndRef.current?.scrollIntoView({
									behavior: "smooth",
									block: "end",
								});
							}}
							className="sticky bottom-1 ml-auto flex items-center gap-1 rounded-full border border-platinum bg-white/95 px-3 py-1.5 text-muted text-xs shadow-sm dark:border-white/10 dark:bg-carbon/95"
						>
							<ArrowDown className="size-3" />
							Jump to latest
						</button>
					) : null}
				</div>

				{showThinking ? (
					<CopilotActivityIndicator
						turnPhase="thinking"
						toolName={null}
						toolSucceeded={null}
					/>
				) : (
					<CopilotActivityIndicator
						turnPhase={turnPhase}
						toolName={displayToolName}
						toolSucceeded={toolSucceeded}
					/>
				)}
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
				{needsCredits ? (
					<div className="rounded-xl border border-platinum bg-white/80 p-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
						<p className="font-semibold">Copilot needs more credits</p>
						<p className="text-muted">{needsCredits}</p>
						<div className="mt-2 flex flex-wrap gap-2">
							<a
								href="/hub/pricing"
								className="rounded-full bg-hyper-green px-3 py-1 font-mono text-carbon text-xs uppercase tracking-[0.18em]"
							>
								Add credits
							</a>
							<button
								type="button"
								onClick={newChat}
								className="rounded-full border border-platinum px-3 py-1 font-mono text-muted text-xs uppercase tracking-[0.18em] dark:border-white/10"
							>
								New chat
							</button>
						</div>
					</div>
				) : null}
				{limitReached ? (
					<div className="rounded-xl border border-platinum bg-white/80 p-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
						<p className="font-semibold">Start a new chat to continue</p>
						<p className="text-muted">{limitReached}</p>
						<p className="mt-1 text-xs text-muted">
							Your conversation stays below. Continue in a fresh chat and add
							what you still need help with.
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							<button
								type="button"
								onClick={continueInNewChat}
								className="rounded-full bg-hyper-green px-3 py-1 font-mono text-carbon text-xs uppercase tracking-[0.18em]"
							>
								Continue in new chat
							</button>
							<button
								type="button"
								onClick={() => void copyTranscript()}
								className="rounded-full border border-platinum px-3 py-1 font-mono text-muted text-xs uppercase tracking-[0.18em] dark:border-white/10"
							>
								{transcriptCopied ? "Copied" : "Copy transcript"}
							</button>
							<a
								href="/hub/pricing"
								className="rounded-full border border-platinum px-3 py-1 font-mono text-muted text-xs uppercase tracking-[0.18em] dark:border-white/10"
							>
								Pricing
							</a>
						</div>
					</div>
				) : null}
				{error ? (
					<div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600">
						<span className="flex-1">{error}</span>
						<button
							type="button"
							onClick={() => setError(null)}
							aria-label="Dismiss Copilot error"
						>
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
						ref={composerRef}
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey && canSend) {
								event.preventDefault();
								void send();
							}
						}}
						rows={2}
						placeholder={
							isAwaitingApproval
								? "Confirm the action above to continue..."
								: "Ask Ration..."
						}
						aria-label="Message Ration Copilot"
						className="min-h-[44px] flex-1 resize-none rounded-xl border border-platinum bg-white px-3 py-2 text-sm outline-none focus:border-hyper-green dark:border-white/10 dark:bg-white/[0.06]"
					/>
					{isTurnActive ? (
						<button
							type="button"
							disabled={isStopping}
							onClick={stopTurn}
							aria-label={isStopping ? "Stopping Copilot" : "Stop Copilot"}
							className="grid size-11 place-items-center rounded-xl bg-hyper-green text-carbon disabled:opacity-40"
						>
							<Square className="size-3.5 fill-current" />
						</button>
					) : (
						<button
							type="button"
							disabled={!canSend}
							onClick={() => void send()}
							aria-label="Send message to Copilot"
							className="grid size-11 place-items-center rounded-xl bg-hyper-green text-carbon disabled:opacity-40"
						>
							<Send className="size-4" />
						</button>
					)}
				</div>
			</div>
		</FilterSheet>
	);
}
