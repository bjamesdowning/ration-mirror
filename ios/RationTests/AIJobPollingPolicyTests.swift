import XCTest
@testable import Ration

final class AIJobPollingPolicyTests: XCTestCase {
    func testPollCompletesImmediately() async throws {
        let poller = AIJobPoller<String>(
            maxAttempts: 5,
            delayNanoseconds: 0,
            fetchStatus: { _ in "done" },
            interpretStatus: { _ in .completed }
        )
        let result = try await poller.poll(requestId: "req-1")
        XCTAssertEqual(result, "done")
    }

    func testPollRespectsCancellation() async {
        let poller = AIJobPoller<String>(
            maxAttempts: 80,
            delayNanoseconds: 500_000_000,
            fetchStatus: { _ in "running" },
            interpretStatus: { _ in .running }
        )
        let task = Task {
            try await poller.poll(requestId: "req-1")
        }
        try? await Task.sleep(nanoseconds: 50_000_000)
        task.cancel()
        do {
            _ = try await task.value
            XCTFail("Expected cancellation")
        } catch is CancellationError {
            // expected
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testPollTimesOut() async {
        let poller = AIJobPoller<String>(
            maxAttempts: 2,
            delayNanoseconds: 0,
            fetchStatus: { _ in "running" },
            interpretStatus: { _ in .running }
        )
        do {
            _ = try await poller.poll(requestId: "req-1")
            XCTFail("Expected timeout")
        } catch AIJobPollError.timedOut {
            // expected
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testPollRetriesTransientServiceError() async throws {
        let attempts = AttemptCounter()
        let poller = AIJobPoller<String>(
            maxAttempts: 3,
            delayNanoseconds: 0,
            fetchStatus: { _ in
                let attempt = await attempts.increment()
                if attempt == 1 {
                    throw APIError.server(status: 503, message: "Busy", code: nil)
                }
                return "done"
            },
            interpretStatus: { _ in .completed }
        )

        let result = try await poller.poll(requestId: "req-1")
        let attemptCount = await attempts.value
        XCTAssertEqual(result, "done")
        XCTAssertEqual(attemptCount, 2)
    }

    func testPollSurfacesTerminalFailure() async {
        let poller = AIJobPoller<String>(
            maxAttempts: 1,
            delayNanoseconds: 0,
            fetchStatus: { _ in "failed" },
            interpretStatus: { _ in .failed("Job failed") }
        )

        do {
            _ = try await poller.poll(requestId: "req-1")
            XCTFail("Expected terminal failure")
        } catch let AIJobPollError.failed(message) {
            XCTAssertEqual(message, "Job failed")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }
}

final class AIErrorHandlingTests: XCTestCase {
    func testMapsProduction402WithoutCodeToPaywall() {
        let error = APIError.server(
            status: 402,
            message: "Insufficient credits",
            code: nil
        )
        XCTAssertEqual(AIErrorHandling.mapSubmitError(error), .paywall)
    }

    func testIgnoresNon402Errors() {
        let error = APIError.server(status: 500, message: "Server error", code: nil)
        XCTAssertNil(AIErrorHandling.mapSubmitError(error))
    }
}

final class APIClientCancellationTests: XCTestCase {
    func testURLCancellationRemainsCancellationError() {
        let normalized = APIClient.normalizedTransportError(URLError(.cancelled))
        XCTAssertTrue(normalized is CancellationError)
    }

    func testOtherTransportErrorsRemainAPIError() {
        let normalized = APIClient.normalizedTransportError(URLError(.notConnectedToInternet))
        guard let apiError = normalized as? APIError else {
            return XCTFail("Expected transport APIError")
        }
        guard case .transport = apiError else {
            return XCTFail("Expected transport APIError")
        }
    }
}

final class QuantityValidationTests: XCTestCase {
    func testValidQuantity() {
        if case let .valid(value) = QuantityValidation.validate(
            "2.5",
            locale: Locale(identifier: "en_US")
        ) {
            XCTAssertEqual(value, 2.5)
        } else {
            XCTFail("Expected valid quantity")
        }
    }

    func testRejectsEmptyAndZero() {
        if case let .invalid(message) = QuantityValidation.validate("") {
            XCTAssertEqual(message, "Enter a quantity.")
        } else {
            XCTFail("Expected invalid empty")
        }
        if case let .invalid(message) = QuantityValidation.validate("0") {
            XCTAssertEqual(message, "Quantity must be greater than zero.")
        } else {
            XCTFail("Expected invalid zero")
        }
    }

    func testAllowZeroAcceptsZeroAndRejectsNegative() {
        if case let .valid(value) = QuantityValidation.validate(
            "0",
            locale: Locale(identifier: "en_US"),
            allowZero: true
        ) {
            XCTAssertEqual(value, 0)
        } else {
            XCTFail("Expected valid zero when allowZero")
        }
        if case let .invalid(message) = QuantityValidation.validate(
            "-1",
            locale: Locale(identifier: "en_US"),
            allowZero: true
        ) {
            XCTAssertEqual(message, "Quantity cannot be negative.")
        } else {
            XCTFail("Expected invalid negative when allowZero")
        }
    }

    func testAcceptsLocalizedDecimalSeparator() {
        if case let .valid(value) = QuantityValidation.validate(
            "1,5",
            locale: Locale(identifier: "fr_FR")
        ) {
            XCTAssertEqual(value, 1.5)
        } else {
            XCTFail("Expected localized decimal quantity")
        }
    }
}

private actor AttemptCounter {
    private(set) var value = 0

    func increment() -> Int {
        value += 1
        return value
    }
}
