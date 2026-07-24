import Foundation

extension AskViewModel {
    // MARK: - Onboarding briefing

    func resetBriefingSession() {
        tracksBriefingSession = false
        briefingComplete = false
        introComplete = false
        introSucceeded = false
        seedComplete = false
        seedTurnStarted = false
        liveBriefingActive = false
        seedItemsAdded = 0
        modelPreset = "fast"
        cancelBriefingTurnTimeout()
    }

    func beginOnboardingBriefingSession() {
        tracksBriefingSession = true
        briefingComplete = false
        introComplete = false
        introSucceeded = false
        seedComplete = false
        seedTurnStarted = false
        liveBriefingActive = true
        seedItemsAdded = 0
        modelPreset = "fast"
    }

    func markSeedTurnStarted() {
        seedTurnStarted = true
    }

    func clearBriefingError() {
        if case .error = state {
            state = .idle
        }
    }

    /// Reset intro flags so bootstrap can be re-sent after a failed/empty reply.
    func prepareIntroRetry() {
        cancelBriefingTurnTimeout()
        introComplete = false
        introSucceeded = false
        seedTurnStarted = false
        seedComplete = false
        briefingComplete = false
        messages = []
        clearBriefingError()
    }

    /// Allow seed to be re-sent after a timeout or failed send.
    func prepareSeedRetry() {
        seedTurnStarted = false
        clearBriefingError()
    }

    func surfaceBriefingError(_ message: String) {
        state = .error(message)
    }

    /// Tear down a stuck briefing turn so Get Started can always proceed.
    func forceEndBriefingTurn() {
        cancelBriefingTurnTimeout()
        dropLiveSocket()
        completeTurn(state: .idle)
    }

    var seedSuccessMessage: String {
        if seedItemsAdded <= 0 {
            return "Kitchen stocked in Cargo"
        }
        let noun = seedItemsAdded == 1 ? "item" : "items"
        return "\(seedItemsAdded) \(noun) added to Cargo"
    }

    func showStaticBriefing(_ markdown: String) {
        messages = [
            CopilotMessage(role: "user", content: OnboardingBriefingCopy.bootstrapPrompt),
            CopilotMessage(role: "assistant", content: markdown),
        ]
        tracksBriefingSession = false
        liveBriefingActive = false
        introComplete = true
        introSucceeded = true
        briefingComplete = true
        seedComplete = false
        seedTurnStarted = false
        state = .idle
        turnPhase = .idle
    }
}
