import XCTest
@testable import Ration

@MainActor
final class ShareLinkControllerTests: XCTestCase {
    func testCancelDuringCreateDoesNotApplyShareURL() async {
        let controller = ShareLinkController()
        let started = expectation(description: "create started")

        let createTask = Task {
            _ = await controller.create(
                {
                    started.fulfill()
                    try await Task.sleep(nanoseconds: 500_000_000)
                    return ShareCreateResponse(
                        shareToken: "tok",
                        shareUrl: "https://example.com/share",
                        shareExpiresAt: "2099-01-01T00:00:00.000Z"
                    )
                },
                onForbidden: { _ in nil }
            )
        }

        await fulfillment(of: [started], timeout: 1)
        controller.cancel()
        await createTask.value

        XCTAssertNil(controller.shareURL)
        XCTAssertNil(controller.shareExpiresAt)
        XCTAssertNil(controller.errorMessage)
    }

    func testCancelDuringRevokeDoesNotClearExistingShare() async {
        let controller = ShareLinkController()
        _ = await controller.create(
            {
                ShareCreateResponse(
                    shareToken: "tok",
                    shareUrl: "https://example.com/share",
                    shareExpiresAt: "2099-01-01T00:00:00.000Z"
                )
            },
            onForbidden: { _ in nil }
        )
        XCTAssertEqual(controller.shareURL, "https://example.com/share")

        let started = expectation(description: "revoke started")
        let revokeTask = Task {
            await controller.revoke {
                started.fulfill()
                try await Task.sleep(nanoseconds: 500_000_000)
                return ShareRevokeResponse(revoked: true)
            }
        }

        await fulfillment(of: [started], timeout: 1)
        controller.cancel()
        await revokeTask.value

        XCTAssertEqual(controller.shareURL, "https://example.com/share")
        XCTAssertEqual(controller.shareExpiresAt, "2099-01-01T00:00:00.000Z")
    }
}
