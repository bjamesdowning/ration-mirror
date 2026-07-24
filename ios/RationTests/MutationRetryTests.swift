import XCTest
@testable import Ration

final class MutationRetryTests: XCTestCase {
    func testDoesNotRetryOtherErrors() async {
        var calls = 0
        do {
            _ = try await MutationRetry.once { () -> Int in
                calls += 1
                throw APIError.transport("boom")
            }
            XCTFail("expected throw")
        } catch let error as APIError {
            if case .transport = error {
                XCTAssertEqual(calls, 1)
            } else {
                XCTFail("unexpected \(error)")
            }
        } catch {
            XCTFail("unexpected \(error)")
        }
    }

    func testRetriesOnceOnRetryableUnauthorized() async throws {
        var calls = 0
        let value = try await MutationRetry.once { () -> Int in
            calls += 1
            if calls == 1 { throw APIError.retryableUnauthorized }
            return 42
        }
        XCTAssertEqual(value, 42)
        XCTAssertEqual(calls, 2)
    }

    func testSurfacesSecondFailure() async {
        var calls = 0
        do {
            _ = try await MutationRetry.once { () -> Int in
                calls += 1
                if calls == 1 { throw APIError.retryableUnauthorized }
                throw APIError.server(status: 500, message: "fail", code: nil)
            }
            XCTFail("expected throw")
        } catch let error as APIError {
            XCTAssertEqual(calls, 2)
            XCTAssertEqual(error.statusCode, 500)
        } catch {
            XCTFail("unexpected \(error)")
        }
    }
}
