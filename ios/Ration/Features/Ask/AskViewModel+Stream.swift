import Foundation

extension AskViewModel {
    // MARK: - Stream / tool results

    func shouldAcceptObservedEvent(_ event: CopilotStreamEvent) -> Bool {
        isTurnActive
            || isAwaitingApproval
            || expectingApprovalContinuation
            || event.type == "message_end"
            || event.type == "error"
            || event.type == "approval_request"
            || event.type == "session_usage_update"
            || event.type == "session_limit_warning"
    }

    func apply(_ event: CopilotStreamEvent) {
        switch event.type {
        case "message_start":
            beginTurnIfNeeded()
            if let message = event.message {
                if message.role == "assistant" {
                    if let index = messages.lastIndex(where: { $0.role == "assistant" && $0.id == message.id }) {
                        if messages[index].content.isEmpty {
                            messages[index] = message
                        }
                    } else if messages.last?.role != "assistant" {
                        messages.append(message)
                    }
                } else if !messages.contains(where: { $0.id == message.id }) {
                    messages.append(message)
                }
            }
            turnPhase = .thinking
        case "text_delta":
            beginTurnIfNeeded()
            markPostApprovalActivity()
            appendAssistantDelta(event.text ?? "", messageId: event.messageId)
            clearTransientError()
            state = .streaming
            turnPhase = .streaming
            persistSnapshotDebounced()
        case "reasoning_start":
            beginTurnIfNeeded()
            markPostApprovalActivity()
            appendReasoningDelta("", mode: .start, messageId: event.messageId)
            turnPhase = .thinking
        case "reasoning_delta":
            beginTurnIfNeeded()
            markPostApprovalActivity()
            appendReasoningDelta(event.text ?? "", mode: .delta, messageId: event.messageId)
            turnPhase = .thinking
        case "reasoning_end":
            appendReasoningDelta("", mode: .end, messageId: event.messageId)
        case "message_end":
            // Stream finish/done still arrives while parked on host approval —
            // keep the Confirm card (do not complete the turn).
            if isAwaitingApproval {
                return
            }
            if case .awaitingApproval = state {
                return
            }
            // After Approve, ignore late pause-stream terminals until continuation
            // delivers tool/text (otherwise empty final / dropped summary).
            if expectingApprovalContinuation && !seenPostApprovalActivity {
                return
            }
            if expectingApprovalContinuation,
               let pauseId = pauseApprovalRequestId,
               let endedId = event.messageId,
               pauseId == endedId {
                return
            }
            expectingApprovalContinuation = false
            seenPostApprovalActivity = false
            pauseApprovalRequestId = nil
            // Late frames after a briefing turn already ended in `.error` must not wipe
            // the retry affordance unless usable content arrived and we can recover.
            if tracksBriefingSession, !isTurnActive, case .error = state {
                if lastAssistantHasUsableContent {
                    if !introComplete {
                        introComplete = true
                        introSucceeded = true
                    } else if seedTurnStarted, !seedComplete {
                        seedComplete = true
                        briefingComplete = true
                    }
                    completeTurn(state: .idle)
                    scheduleImmediateSnapshotSave()
                }
                return
            }

            clearTransientError()
            if tracksBriefingSession {
                if !introComplete {
                    introComplete = true
                    introSucceeded = lastAssistantHasUsableContent
                    if !introSucceeded {
                        completeTurn(state: .error(OnboardingBriefingCopy.emptyIntroMessage))
                        scheduleImmediateSnapshotSave()
                        return
                    }
                } else if seedTurnStarted, isTurnActive {
                    seedComplete = true
                    briefingComplete = true
                }
            }
            completeTurn(state: .idle)
            scheduleImmediateSnapshotSave()
        case "tool_start":
            beginTurnIfNeeded()
            markPostApprovalActivity()
            if let status = event.status {
                activeTool = CopilotToolStatus(
                    toolCallId: status.toolCallId,
                    toolName: status.toolName,
                    label: CopilotToolLabels.label(for: status.toolName, phase: .running)
                )
            }
            completedTool = nil
            toolLingerTask?.cancel()
            state = .streaming
            turnPhase = .toolRunning
        case "tool_end":
            markPostApprovalActivity()
            let toolName = activeTool?.toolName ?? "tool"
            let succeeded = event.ok == true
            if tracksBriefingSession, toolName == "add_cargo_item", succeeded {
                seedItemsAdded += 1
            }
            activeTool = nil
            completedTool = CompletedTool(
                toolName: toolName,
                label: CopilotToolLabels.label(for: toolName, phase: succeeded ? .done : .error),
                succeeded: succeeded
            )
            turnPhase = .toolDone
            toolLingerTask?.cancel()
            toolLingerTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 800_000_000)
                guard !Task.isCancelled else { return }
                guard let self else { return }
                if self.completedTool?.toolName == toolName {
                    self.completedTool = nil
                    if self.isTurnActive, self.turnPhase == .toolDone {
                        self.turnPhase = .thinking
                    }
                }
            }
            scheduleImmediateSnapshotSave()
        case "approval_request":
            guard !isStopping else { return }
            beginTurnIfNeeded()
            turnPhase = .idle
            guard let approvalId = event.approvalId else {
                completeTurn(state: .error("Copilot sent an invalid approval request."))
                return
            }
            let toolName = event.toolName
                ?? activeTool?.toolName
                ?? "Copilot action"
            let title = event.title ?? "Confirm \(toolName)"
            let description = event.description
                ?? "Copilot wants to run \(toolName)."
            isAwaitingApproval = true
            expectingApprovalContinuation = false
            seenPostApprovalActivity = false
            pauseApprovalRequestId = event.messageId
            state = .awaitingApproval(
                id: approvalId,
                title: title,
                description: description
            )
        case "blocked_feature":
            if let blocked = event.blocked {
                completeTurn(state: .blocked(blocked))
            } else {
                completeTurn(state: .error("Copilot sent an invalid blocked action."))
            }
        case "session_usage_update":
            if let usage = event.usage {
                sessionUsage = CopilotSessionUsage.mergeMonotonic(
                    previous: sessionUsage,
                    incoming: usage
                )
                if let currentStatus = status {
                    status = CopilotStatusResponse(
                        tier: currentStatus.tier,
                        freeConversationsRemaining: currentStatus.freeConversationsRemaining,
                        allowanceResetAt: currentStatus.allowanceResetAt,
                        creditBalance: usage.creditBalance,
                        autoDeductConsent: currentStatus.autoDeductConsent,
                        conversationFloorCost: currentStatus.conversationFloorCost,
                        sessionIdleMs: currentStatus.sessionIdleMs,
                        tokensPerCredit: currentStatus.tokensPerCredit,
                        sessionMaxTokens: currentStatus.sessionMaxTokens,
                        onboardingBriefingEligible: currentStatus.onboardingBriefingEligible,
                        onboardingBriefingConsumed: currentStatus.onboardingBriefingConsumed
                    )
                }
                scheduleImmediateSnapshotSave(touchActivity: false)
            }
        case "session_limit_warning":
            if let warning = event.warning {
                sessionLimitWarning = warning
                if warning.isUrgent {
                    urgentWarningAcknowledged = false
                }
            }
        case "error":
            let wasTurnActive = isTurnActive
            if event.error?.code == "onboarding_briefing_exhausted" {
                briefingComplete = true
                introComplete = true
                // Don't unlock seed on a soft-deny — surface escape copy instead.
                completeTurn(
                    state: .error(
                        event.error?.message
                            ?? "Your welcome briefing is complete. Tap Get Started to continue."
                    )
                )
                return
            }
            if event.error?.code == "onboarding_briefing_invalid_prompt" {
                completeTurn(
                    state: .error(
                        event.error?.message
                            ?? "That prompt isn't part of the welcome briefing. Tap Stock my kitchen or Get Started."
                    )
                )
                return
            }
            isConnected = false
            if event.error?.code == "session_limit_reached" {
                // Preserve transcript and let the user start a new chat explicitly.
                dropLiveSocket()
                completeTurn(state: .sessionLimitReached(event.error?.message ?? "This Copilot chat is full. Start a new chat to continue."))
                scheduleImmediateSnapshotSave()
                return
            }
            if event.error?.code == "insufficient_credits" {
                // Preserve transcript; user needs to add credits before continuing.
                dropLiveSocket()
                completeTurn(state: .insufficientCredits(event.error?.message ?? "Copilot needs more credits."))
                scheduleImmediateSnapshotSave()
                return
            }
            if !wasTurnActive {
                return
            }
            completeTurn(
                state: .error(event.error?.message ?? event.text ?? "Copilot hit an error.")
            )
        default:
            break
        }
    }

    private enum ReasoningAppendMode {
        case start
        case delta
        case end
    }

    private func appendReasoningDelta(
        _ text: String,
        mode: ReasoningAppendMode,
        messageId: String?
    ) {
        if messages.last?.role == "assistant", let index = messages.indices.last {
            var message = messages[index]
            switch mode {
            case .start:
                message.reasoning = message.reasoning ?? ""
                message.reasoningState = "streaming"
            case .delta:
                message.reasoning = (message.reasoning ?? "") + text
                message.reasoningState = "streaming"
            case .end:
                message.reasoningState = "complete"
            }
            messages[index] = message
            return
        }

        guard mode != .end else { return }
        messages.append(
            CopilotMessage(
                id: messageId ?? UUID().uuidString,
                role: "assistant",
                content: "",
                reasoning: mode == .delta ? text : "",
                reasoningState: "streaming"
            )
        )
    }

    private func appendAssistantDelta(_ text: String, messageId: String?) {
        if messages.last?.role == "assistant", let index = messages.indices.last {
            messages[index].content += text
        } else {
            messages.append(
                CopilotMessage(
                    id: messageId ?? UUID().uuidString,
                    role: "assistant",
                    content: text
                )
            )
        }
    }

    var lastAssistantHasUsableContent: Bool {
        guard let last = messages.last(where: { $0.role == "assistant" }) else { return false }
        return !last.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
