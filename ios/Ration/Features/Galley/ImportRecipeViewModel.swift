import Foundation
import Observation

@MainActor
@Observable
final class ImportRecipeViewModel {
    enum State {
        case idle
        case submitting
        case processing(requestId: String)
        case capturing
        case verification(ExtractedRecipePreview, requestId: String)
        case confirming
        case duplicate(existingMealId: String, existingMealName: String?)
        case completed(MealSummary)
        case failed(String)
        case siteBlocked(message: String)
    }

    private(set) var state: State = .idle
    var url = ""
    var shouldShowPaywall = false
    var paywallContext: PaywallContext?
    private var activeTask: Task<Void, Never>?
    private var submissionGeneration = 0
    private var didAttemptDeviceCapture = false

    func cancelActiveWork() {
        submissionGeneration += 1
        activeTask?.cancel()
        activeTask = nil
    }

    func submit(api: RationAPI, session: SessionStore) {
        cancelActiveWork()
        let generation = submissionGeneration
        shouldShowPaywall = false
        didAttemptDeviceCapture = false
        state = .submitting
        activeTask = Task {
            do {
                let response = try await api.importRecipe(ImportRecipeRequest(url: url))
                guard isCurrent(generation) else { return }
                guard let requestId = response.requestId else {
                    state = .failed("Import started but no request id was returned.")
                    return
                }
                Haptics.light()
                state = .processing(requestId: requestId)
                Task { await AIErrorHandling.refreshCredits(session: session, api: api) }
                await poll(requestId: requestId, api: api, generation: generation, session: session)
            } catch is CancellationError {
                return
            } catch let error as APIError where error.statusCode == 409 && error.code == "DUPLICATE_URL" {
                guard isCurrent(generation) else { return }
                if let existingId = error.existingMealId {
                    state = .duplicate(
                        existingMealId: existingId,
                        existingMealName: error.existingMealName
                    )
                } else {
                    state = .failed(error.errorDescription ?? "This recipe URL was already imported.")
                }
            } catch {
                guard isCurrent(generation) else { return }
                if AIErrorHandling.mapSubmitError(error) == .paywall {
                    paywallContext = .credits()
                    shouldShowPaywall = true
                    state = .idle
                } else if AIErrorHandling.mapSubmitError(error) == .featureDisabled {
                    state = .failed(AIErrorHandling.featureDisabledMessage)
                } else {
                    state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                }
            }
        }
    }

    func poll(
        requestId: String,
        api: RationAPI,
        generation: Int,
        session: SessionStore
    ) async {
        let maxAttempts = 80
        let delayNanoseconds: UInt64 = 1_500_000_000
        for attempt in 0..<maxAttempts {
            do {
                try Task.checkCancellation()
                if attempt > 0 {
                    try await Task.sleep(nanoseconds: delayNanoseconds)
                }
                let result = try await api.importRecipeStatus(requestId: requestId)
                guard isCurrent(generation) else { return }
                if result.code == "DUPLICATE_URL", let existingId = result.existingMealId {
                    state = .duplicate(
                        existingMealId: existingId,
                        existingMealName: result.existingMealName
                    )
                    return
                }
                switch result.status {
                case "completed":
                    if let meal = result.meal {
                        state = .completed(meal)
                    } else if let extracted = result.extractedRecipe {
                        state = .verification(extracted, requestId: requestId)
                    } else {
                        state = .failed(result.error ?? "Import completed without recipe data.")
                    }
                    return
                case "failed":
                    if shouldAttemptDeviceCapture(result) {
                        await captureAndRetry(api: api, generation: generation, session: session)
                        return
                    }
                    if isSiteBlocked(result) {
                        state = .siteBlocked(
                            message: result.error
                                ?? "This site blocked automated import. Try loading from your device again, or add the meal manually."
                        )
                        return
                    }
                    state = .failed(result.error ?? "Import failed.")
                    return
                default:
                    state = .processing(requestId: requestId)
                }
            } catch is CancellationError {
                return
            } catch {
                guard isCurrent(generation) else { return }
                if let apiError = error as? APIError,
                   [429, 503].contains(apiError.statusCode ?? 0),
                   attempt < maxAttempts - 1
                {
                    continue
                }
                state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                return
            }
        }
        guard isCurrent(generation) else { return }
        state = .failed("Import is still processing. Check Galley shortly.")
    }

    private func shouldAttemptDeviceCapture(_ result: ImportRecipeStatusResponse) -> Bool {
        !didAttemptDeviceCapture && isSiteBlocked(result)
    }

    private func isSiteBlocked(_ result: ImportRecipeStatusResponse) -> Bool {
        if result.code == "SITE_BLOCKED" { return true }
        let message = (result.error ?? "").lowercased()
        return message.contains("blocked automated import")
            || message.contains("access issue")
            || message.contains("paste the page html")
    }

    private func captureAndRetry(
        api: RationAPI,
        generation: Int,
        session: SessionStore
    ) async {
        didAttemptDeviceCapture = true
        state = .capturing
        do {
            let html = try await RecipePageCapture.captureHtml(from: url)
            guard isCurrent(generation) else { return }
            // Assisted retry is a new 1-credit job (blocked attempt was refunded).
            state = .submitting
            let response = try await api.importRecipe(
                ImportRecipeRequest(url: url, pageHtml: html)
            )
            guard isCurrent(generation) else { return }
            guard let requestId = response.requestId else {
                state = .failed("Import started but no request id was returned.")
                return
            }
            Haptics.light()
            state = .processing(requestId: requestId)
            Task { await AIErrorHandling.refreshCredits(session: session, api: api) }
            await poll(requestId: requestId, api: api, generation: generation, session: session)
        } catch is CancellationError {
            return
        } catch let error as RecipePageCaptureError {
            guard isCurrent(generation) else { return }
            state = .siteBlocked(message: error.localizedDescription)
        } catch {
            guard isCurrent(generation) else { return }
            if AIErrorHandling.mapSubmitError(error) == .paywall {
                paywallContext = .credits()
                shouldShowPaywall = true
                state = .idle
            } else if AIErrorHandling.mapSubmitError(error) == .featureDisabled {
                state = .failed(AIErrorHandling.featureDisabledMessage)
            } else {
                state = .siteBlocked(
                    message: (error as? APIError)?.errorDescription
                        ?? error.localizedDescription
                )
            }
        }
    }

    func confirm(requestId: String, api: RationAPI, isCrewMember: Bool = false) async {
        state = .confirming
        do {
            let response = try await api.importRecipeConfirm(requestId: requestId)
            state = .completed(response.meal)
        } catch let error as APIError {
            if let ctx = CapacityUpgrade.context(from: error, isCrewMember: isCrewMember) {
                paywallContext = ctx
                shouldShowPaywall = true
                state = .failed(ctx.reasonTitle ?? "Meal capacity reached")
            } else {
                state = .failed(error.errorDescription ?? error.localizedDescription)
            }
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func reset() {
        cancelActiveWork()
        state = .idle
        shouldShowPaywall = false
        paywallContext = nil
        didAttemptDeviceCapture = false
    }

    private func isCurrent(_ generation: Int) -> Bool {
        !Task.isCancelled && generation == submissionGeneration
    }
}
