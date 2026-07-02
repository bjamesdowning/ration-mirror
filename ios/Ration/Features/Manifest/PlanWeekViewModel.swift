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
    private let maxPollAttempts = 80
    private let pollDelayNanoseconds: UInt64 = 1_500_000_000

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

    func submit(api: RationAPI) async {
        guard canSubmitPlan else {
            state = .failed("Select a date range of 1–7 days.")
            return
        }
        state = .submitting
        do {
            let response = try await api.planWeek(PlanWeekRequest(
                startDate: startDate,
                days: days,
                dietaryNote: dietaryNote.isEmpty ? nil : dietaryNote,
                variety: variety
            ))
            guard let requestId = response.requestId else {
                state = .failed("Planning started but no request id was returned.")
                return
            }
            Haptics.light()
            state = .processing(requestId: requestId)
            await poll(requestId: requestId, api: api)
        } catch {
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func poll(requestId: String, api: RationAPI) async {
        for attempt in 0..<maxPollAttempts {
            do {
                try await Task.sleep(nanoseconds: pollDelayNanoseconds)
                let result = try await api.planWeekStatus(requestId: requestId)
                switch result.status {
                case "completed":
                    scheduleEntries = result.schedule ?? []
                    state = .completed
                    return
                case "failed":
                    state = .failed(result.error ?? "Planning failed.")
                    return
                default:
                    state = .processing(requestId: requestId)
                }
            } catch is CancellationError {
                return
            } catch {
                if let apiError = error as? APIError,
                   [429, 503].contains(apiError.statusCode ?? 0),
                   attempt < maxPollAttempts - 1
                {
                    continue
                }
                state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                return
            }
        }
        state = .failed("Planning is still processing. Refresh Manifest shortly.")
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
        state = .idle
        scheduleEntries = []
        rangeStart = nil
        rangeEnd = nil
    }

    func fail(_ message: String) { state = .failed(message) }
}
