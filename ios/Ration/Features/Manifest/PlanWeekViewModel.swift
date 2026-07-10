import Foundation
import Observation

@MainActor
@Observable
final class PlanWeekViewModel {
    enum State {
        case idle
        case submitting
        case processing(requestId: String)
        case completed
        case failed(String)
    }

    private(set) var state: State = .idle
    var scheduleEntries: [PlanWeekScheduleEntry] = []
    var rangeStart: String?
    var rangeEnd: String?
    var dietaryNote = ""
    var variety = "medium"
    var shouldShowPaywall = false
    private var activeTask: Task<Void, Never>?
    private var submissionGeneration = 0

    var startDate: String {
        rangeStart ?? ManifestDateHelpers.todayISO()
    }

    var days: Int {
        guard let start = rangeStart, let end = rangeEnd,
              let count = PlanWeekRangeSelection.dayCount(start: start, end: end)
        else { return 1 }
        return count
    }

    var canSubmitPlan: Bool {
        PlanWeekRangeSelection.isValid(start: rangeStart, end: rangeEnd)
    }

    func cancelActiveWork() {
        submissionGeneration += 1
        activeTask?.cancel()
        activeTask = nil
    }

    func submit(api: RationAPI, session: SessionStore) {
        guard canSubmitPlan else {
            state = .failed("Select a date range of 1–7 days.")
            return
        }
        cancelActiveWork()
        let generation = submissionGeneration
        shouldShowPaywall = false
        state = .submitting
        activeTask = Task {
            do {
                let response = try await api.planWeek(PlanWeekRequest(
                    startDate: startDate,
                    days: days,
                    dietaryNote: dietaryNote.isEmpty ? nil : dietaryNote,
                    variety: variety
                ))
                guard isCurrent(generation) else { return }
                guard let requestId = response.requestId else {
                    state = .failed("Planning started but no request id was returned.")
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
                    shouldShowPaywall = true
                    state = .idle
                } else {
                    state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                }
            }
        }
    }

    func poll(requestId: String, api: RationAPI, generation: Int) async {
        let poller = AIJobPoller<PlanWeekStatusResponse>(
            fetchStatus: { try await api.planWeekStatus(requestId: $0) },
            interpretStatus: { result in
                switch result.status {
                case "completed": .completed
                case "failed": .failed(result.error ?? "Planning failed.")
                default: .running
                }
            }
        )
        do {
            let result = try await poller.poll(requestId: requestId)
            guard isCurrent(generation) else { return }
            scheduleEntries = result.schedule ?? []
            state = .completed
        } catch is CancellationError {
            return
        } catch AIJobPollError.timedOut {
            guard isCurrent(generation) else { return }
            state = .failed("Planning is still processing. Refresh Manifest shortly.")
        } catch let AIJobPollError.failed(message) {
            guard isCurrent(generation) else { return }
            state = .failed(message)
        } catch {
            guard isCurrent(generation) else { return }
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func removeScheduleEntry(_ entry: PlanWeekScheduleEntry) {
        scheduleEntries.removeAll { $0.id == entry.id }
    }

    func applySchedule(api: RationAPI) async throws -> Int {
        let bulk = scheduleEntries.map {
            BulkManifestEntry(mealId: $0.mealId, date: $0.date, slotType: $0.slotType, notes: $0.notes)
        }
        let response = try await api.bulkManifest(BulkManifestRequest(entries: bulk))
        Haptics.success()
        return response.inserted
    }

    func reset() {
        cancelActiveWork()
        state = .idle
        scheduleEntries = []
        rangeStart = nil
        rangeEnd = nil
        shouldShowPaywall = false
    }

    func fail(_ message: String) { state = .failed(message) }

    private func isCurrent(_ generation: Int) -> Bool {
        !Task.isCancelled && generation == submissionGeneration
    }
}
