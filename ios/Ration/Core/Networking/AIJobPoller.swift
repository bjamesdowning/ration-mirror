import Foundation

/// Shared cancellable AI status polling with bounded retries.
struct AIJobPoller<Status: Sendable> {
    typealias FetchStatus = @Sendable (String) async throws -> Status
    typealias InterpretStatus = @Sendable (Status) -> AIJobPollOutcome

    enum AIJobPollOutcome: Equatable {
        case running
        case completed
        case failed(String)
    }

    let maxAttempts: Int
    let delayNanoseconds: UInt64
    let backoffAfterNanoseconds: UInt64
    let backoffDelayNanoseconds: UInt64
    let fetchStatus: FetchStatus
    let interpretStatus: InterpretStatus

    init(
        maxAttempts: Int = 80,
        delayNanoseconds: UInt64 = 1_500_000_000,
        backoffAfterNanoseconds: UInt64 = 10_000_000_000,
        backoffDelayNanoseconds: UInt64 = 3_000_000_000,
        fetchStatus: @escaping FetchStatus,
        interpretStatus: @escaping InterpretStatus
    ) {
        self.maxAttempts = maxAttempts
        self.delayNanoseconds = delayNanoseconds
        self.backoffAfterNanoseconds = backoffAfterNanoseconds
        self.backoffDelayNanoseconds = backoffDelayNanoseconds
        self.fetchStatus = fetchStatus
        self.interpretStatus = interpretStatus
    }

    private func delay(beforeAttempt attempt: Int) -> UInt64 {
        guard attempt > 0 else { return 0 }
        let elapsed = UInt64(attempt - 1) * delayNanoseconds
        return elapsed >= backoffAfterNanoseconds ? backoffDelayNanoseconds : delayNanoseconds
    }

    func poll(requestId: String) async throws -> Status {
        for attempt in 0..<maxAttempts {
            try Task.checkCancellation()
            let sleepNs = delay(beforeAttempt: attempt)
            if sleepNs > 0 {
                try await Task.sleep(nanoseconds: sleepNs)
            }
            try Task.checkCancellation()

            do {
                let status = try await fetchStatus(requestId)
                switch interpretStatus(status) {
                case .completed:
                    return status
                case let .failed(message):
                    throw AIJobPollError.failed(message)
                case .running:
                    continue
                }
            } catch is CancellationError {
                throw CancellationError()
            } catch let error as AIJobPollError {
                throw error
            } catch {
                if let apiError = error as? APIError,
                   [429, 503].contains(apiError.statusCode ?? 0),
                   attempt < maxAttempts - 1
                {
                    continue
                }
                throw error
            }
        }
        throw AIJobPollError.timedOut
    }
}

enum AIJobPollError: Error, Equatable {
    case failed(String)
    case timedOut
}
