import Foundation
import Observation
import UIKit

@MainActor
@Observable
final class ImportRecipeViewModel {
    enum ImportInputMode: String, CaseIterable, Identifiable {
        case link
        case photo

        var id: String { rawValue }

        var label: String {
            switch self {
            case .link: "Link"
            case .photo: "Photo"
            }
        }
    }

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
        case softFailToPhoto(message: String)
        case siteBlocked(message: String)
    }

    enum PhotoPrepError: LocalizedError {
        case unreadable
        case tooLarge
        case unsupportedFormat

        var errorDescription: String? {
            switch self {
            case .unreadable: return "Could not read the selected image."
            case .tooLarge: return "Image must be 3MB or smaller."
            case .unsupportedFormat: return "Use JPEG, PNG, or WebP."
            }
        }
    }

	private static let photoMaxBytes = 3 * 1024 * 1024

    private(set) var state: State = .idle
    var url = ""
    var inputMode: ImportInputMode = .link
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
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        beginSubmission(generation: submissionGeneration + 1) { generation in
            let response = try await api.importRecipe(ImportRecipeRequest(url: trimmed))
            try await self.handleSubmitResponse(
                response,
                api: api,
                session: session,
                generation: generation
            )
        }
    }

    func submitPhoto(data: Data, api: RationAPI, session: SessionStore) {
        beginSubmission(generation: submissionGeneration + 1) { generation in
            let prepared = try Self.preparePhoto(data)
            let response = try await api.importRecipe(
                ImportRecipeRequest(
                    photoBase64: prepared.base64,
                    photoMimeType: prepared.mimeType
                )
            )
            try await self.handleSubmitResponse(
                response,
                api: api,
                session: session,
                generation: generation
            )
        }
    }

    func switchToPhotoImport() {
        cancelActiveWork()
        inputMode = .photo
        state = .idle
        shouldShowPaywall = false
        paywallContext = nil
        didAttemptDeviceCapture = false
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
                    if result.softFailToPhoto == true {
                        state = .softFailToPhoto(
                            message: result.error
                                ?? "We couldn't read enough from that link. Try a recipe screenshot instead."
                        )
                        return
                    }
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

    private func beginSubmission(
        generation: Int,
        operation: @escaping @MainActor (Int) async throws -> Void
    ) {
        cancelActiveWork()
        submissionGeneration = generation
        shouldShowPaywall = false
        didAttemptDeviceCapture = false
        state = .submitting
        activeTask = Task {
            do {
                try await operation(generation)
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

    private func handleSubmitResponse(
        _ response: AIJobSubmitResponse,
        api: RationAPI,
        session: SessionStore,
        generation: Int
    ) async throws {
        guard isCurrent(generation) else { return }
        guard let requestId = response.requestId else {
            state = .failed("Import started but no request id was returned.")
            return
        }
        Haptics.light()
        state = .processing(requestId: requestId)
        Task { await AIErrorHandling.refreshCredits(session: session, api: api) }
        await poll(requestId: requestId, api: api, generation: generation, session: session)
    }

    private func shouldAttemptDeviceCapture(_ result: ImportRecipeStatusResponse) -> Bool {
        !didAttemptDeviceCapture && isSiteBlocked(result)
    }

    private func isSiteBlocked(_ result: ImportRecipeStatusResponse) -> Bool {
        if result.code == "SITE_BLOCKED" { return true }
        if result.code == "IMPORT_PROVIDER_UNAVAILABLE" { return true }
        let message = (result.error ?? "").lowercased()
        return message.contains("blocked automated import")
            || message.contains("access issue")
            || message.contains("paste the page html")
            || message.contains("import helpers are temporarily unavailable")
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
            // Assisted retry is a new 3-credit job (blocked attempt was refunded).
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

    func fail(with message: String) {
        cancelActiveWork()
        state = .failed(message)
    }

    private func isCurrent(_ generation: Int) -> Bool {
        !Task.isCancelled && generation == submissionGeneration
    }

    private static func preparePhoto(_ data: Data) throws -> (base64: String, mimeType: String) {
        guard let image = UIImage(data: data) else {
            throw PhotoPrepError.unreadable
        }

        let mime: String
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) {
            mime = "image/png"
        } else if data.starts(with: [0x52, 0x49, 0x46, 0x46]) {
            mime = "image/webp"
        } else {
            mime = "image/jpeg"
        }

        let prepared = image.resizedJPEG(maxDimension: 1600, quality: 0.82) ?? data
        if prepared.count > photoMaxBytes {
            throw PhotoPrepError.tooLarge
        }

        return (prepared.base64EncodedString(), mime)
    }
}
