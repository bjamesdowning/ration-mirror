import Foundation
import Observation
import UIKit

@MainActor
@Observable
final class ScanViewModel {
    enum State {
        case idle
        case uploading
        case processing(requestId: String)
        case completed(requestId: String)
        case confirming
        case confirmed(added: Int, updated: Int)
        case failed(String)
    }

    private(set) var state: State = .idle
    var reviewItems: [EditableScanResultItem] = []
    var editingItemId: String?
    var shouldShowPaywall = false
    var paywallContext: PaywallContext?
    /// True while chunked nutrition resolve is in flight (scan review UI).
    private(set) var isResolvingNutrition = false
    /// Soft-fail banner when every resolve chunk failed.
    private(set) var nutritionLookupFailed = false
    private var activeTask: Task<Void, Never>?
    private var submissionGeneration = 0

    var selectedCount: Int {
        reviewItems.filter(\.selected).count
    }

    var isEditing: Bool {
        editingItemId != nil
    }

    func cancelActiveWork() {
        submissionGeneration += 1
        activeTask?.cancel()
        activeTask = nil
    }

    func submit(image: UIImage, api: RationAPI, session: SessionStore) {
        cancelActiveWork()
        let generation = submissionGeneration
        shouldShowPaywall = false
        state = .uploading
        activeTask = Task {
            do {
                guard let data = try await ScanImageProcessor.resizedJPEG(from: image) else {
                    guard isCurrent(generation) else { return }
                    state = .failed("Could not process the image.")
                    return
                }
                guard isCurrent(generation) else { return }
                let response = try await api.submitScan(imageData: data)
                guard isCurrent(generation) else { return }
                guard let requestId = response.requestId else {
                    state = .failed("Scan was submitted but no request id was returned.")
                    return
                }
                Haptics.light()
                state = .processing(requestId: requestId)
                Task { await AIErrorHandling.refreshCredits(session: session, api: api) }
                await poll(
                    requestId: requestId,
                    api: api,
                    generation: generation,
                    nutritionEngine: session.clientFlags.isNutritionEngineEnabled,
                    nutritionAiEstimate: session.clientFlags.isNutritionAiEstimateEnabled
                )
            } catch is CancellationError {
                return
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
        nutritionEngine: Bool = false,
        nutritionAiEstimate: Bool = false
    ) async {
        let poller = AIJobPoller<ScanStatusResponse>(
            fetchStatus: { try await api.scanStatus(requestId: $0) },
            interpretStatus: { result in
                switch result.status {
                case "completed": .completed
                case "failed": .failed(ScanUserFacingError.message(from: result.error))
                default: .running
                }
            }
        )
        do {
            let result = try await poller.poll(requestId: requestId)
            guard isCurrent(generation) else { return }
            let items = result.items ?? []
            reviewItems = items.map { EditableScanResultItem(from: $0) }
            editingItemId = nil
            state = .completed(requestId: requestId)
            await resolveNutritionIfNeeded(
                api: api,
                generation: generation,
                nutritionEngine: nutritionEngine,
                nutritionAiEstimate: nutritionAiEstimate
            )
        } catch is CancellationError {
            return
        } catch AIJobPollError.timedOut {
            guard isCurrent(generation) else { return }
            state = .failed("Scan is still processing. Pull Cargo to refresh shortly.")
        } catch let AIJobPollError.failed(message) {
            guard isCurrent(generation) else { return }
            state = .failed(ScanUserFacingError.message(from: message))
        } catch {
            guard isCurrent(generation) else { return }
            state = .failed(
                ScanUserFacingError.message(
                    from: (error as? APIError)?.errorDescription ?? error.localizedDescription
                )
            )
        }
    }

    /// Soft-fail USDA / AI estimate proposal after OCR (web ScanResultsModal parity).
    /// Resolves in chunks so kcal can appear progressively while the user reviews.
    func resolveNutritionIfNeeded(
        api: RationAPI,
        generation: Int,
        nutritionEngine: Bool,
        nutritionAiEstimate: Bool
    ) async {
        guard nutritionEngine else {
            isResolvingNutrition = false
            nutritionLookupFailed = false
            return
        }
        let names = NutritionResolveChunking.uniqueTrimmedNames(
            reviewItems.map(\.name)
        )
        guard !names.isEmpty else {
            isResolvingNutrition = false
            nutritionLookupFailed = false
            return
        }

        isResolvingNutrition = true
        nutritionLookupFailed = false
        defer {
            if isCurrent(generation) {
                isResolvingNutrition = false
            }
        }

        var anyOk = false
        for chunk in NutritionResolveChunking.chunks(names) {
            guard isCurrent(generation) else { return }
            do {
                let response = try await api.resolveNutrition(
                    names: chunk,
                    ingestSource: nutritionAiEstimate ? "scan_review" : nil
                )
                guard isCurrent(generation) else { return }
                anyOk = true
                for (name, snap) in response.snapshots {
                    for index in reviewItems.indices {
                        let key = reviewItems[index].name.trimmingCharacters(in: .whitespacesAndNewlines)
                        if key == name {
                            reviewItems[index].nutrition = snap
                        }
                    }
                }
            } catch {
                // Soft-fail this chunk; continue remaining batches.
            }
        }
        if isCurrent(generation) {
            nutritionLookupFailed = !anyOk
        }
    }

    func toggleSelection(_ id: String) {
        guard let index = reviewItems.firstIndex(where: { $0.id == id }) else { return }
        reviewItems[index].selected.toggle()
    }

    func startEditing(_ id: String) {
        editingItemId = id
    }

    func cancelEditing() {
        editingItemId = nil
    }

    func saveEdit(_ updated: EditableScanResultItem) -> String? {
        guard let index = reviewItems.firstIndex(where: { $0.id == updated.id }) else { return nil }
        reviewItems[index] = updated
        editingItemId = nil
        Haptics.light()
        return nil
    }

    func saveEdit(id: String, name: String, quantityText: String, unit: String) -> String? {
        guard let index = reviewItems.firstIndex(where: { $0.id == id }) else { return nil }
        switch reviewItems[index].applyingEdit(name: name, quantityText: quantityText, unit: unit) {
        case let .saved(updated):
            reviewItems[index] = updated
            editingItemId = nil
            Haptics.light()
            return nil
        case let .invalidName(message), let .invalidQuantity(message):
            return message
        }
    }

    func confirmToCargo(api: RationAPI, nutritionAiEstimate: Bool = false) async {
        guard editingItemId == nil else {
            state = .failed("Finish editing before adding to Cargo.")
            return
        }
        let chosen = reviewItems.filter(\.selected)
        guard !chosen.isEmpty else {
            state = .failed("Select at least one item to add to Cargo.")
            return
        }
        state = .confirming
        let batchItems = chosen.map { $0.toBatchCargoItem() }
        let request = BatchCargoRequest(
            items: batchItems,
            ingestSource: nutritionAiEstimate ? "scan_review" : nil
        )
        do {
            let result = try await api.batchAddCargo(request)
            if let ctx = CapacityUpgrade.context(fromBatchErrors: result.errors) {
                paywallContext = ctx
                shouldShowPaywall = true
                if result.added + result.updated > 0 {
                    Haptics.success()
                    state = .confirmed(added: result.added, updated: result.updated)
                } else {
                    state = .failed(ctx.reasonTitle ?? "Cargo capacity reached")
                }
                return
            }
            Haptics.success()
            state = .confirmed(added: result.added, updated: result.updated)
        } catch let error as APIError {
            if let ctx = CapacityUpgrade.context(from: error) {
                paywallContext = ctx
                shouldShowPaywall = true
                state = .failed(ctx.reasonTitle ?? "Capacity limit reached")
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
        reviewItems = []
        editingItemId = nil
        shouldShowPaywall = false
        paywallContext = nil
        isResolvingNutrition = false
        nutritionLookupFailed = false
    }

    private func isCurrent(_ generation: Int) -> Bool {
        !Task.isCancelled && generation == submissionGeneration
    }
}
