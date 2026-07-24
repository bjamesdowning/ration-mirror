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
                await poll(requestId: requestId, api: api, generation: generation)
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

    func poll(requestId: String, api: RationAPI, generation: Int) async {
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

    func confirmToCargo(api: RationAPI) async {
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
        do {
            let result = try await api.batchAddCargo(BatchCargoRequest(items: batchItems))
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
    }

    private func isCurrent(_ generation: Int) -> Bool {
        !Task.isCancelled && generation == submissionGeneration
    }
}
