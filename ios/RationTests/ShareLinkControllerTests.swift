import XCTest
@testable import Ration

@MainActor
final class ShareLinkControllerTests: XCTestCase {
    func testLoadStatusAssignsBothFieldsFromSingleFetch() async {
        let controller = ShareLinkController()
        var fetchCount = 0
        controller.loadStatus {
            fetchCount += 1
            return ShareStatusResponse(
                shareUrl: "https://ration.mayutic.com/s/abc",
                shareExpiresAt: "2099-01-01T00:00:00Z"
            )
        }
        await waitUntil { !controller.isLoading }
        XCTAssertEqual(fetchCount, 1)
        XCTAssertEqual(controller.shareURL, "https://ration.mayutic.com/s/abc")
        XCTAssertEqual(controller.shareExpiresAt, "2099-01-01T00:00:00Z")
        XCTAssertNil(controller.errorMessage)
    }

    func testCreateForbiddenReturnsPaywall() async {
        let controller = ShareLinkController()
        let paywall = await controller.create({
            throw APIError.server(status: 403, message: "gated", code: "feature_gated", errorCode: "feature_gated")
        }, onForbidden: { ShareLinkController.paywallContext(from: $0) })
        XCTAssertNotNil(paywall)
        XCTAssertNil(controller.shareURL)
    }

    func testLoadTransportErrorSurfacesMessage() async {
        let controller = ShareLinkController()
        controller.loadStatus {
            throw APIError.transport("timeout")
        }
        await waitUntil { !controller.isLoading }
        XCTAssertEqual(controller.errorMessage, "Network error. Please try again.")
    }

    func testRevokeFailureKeepsURL() async {
        let controller = ShareLinkController()
        controller.loadStatus {
            ShareStatusResponse(shareUrl: "https://ration.mayutic.com/s/keep", shareExpiresAt: nil)
        }
        await waitUntil { !controller.isLoading }
        await controller.revoke {
            throw APIError.transport("offline")
        }
        XCTAssertEqual(controller.shareURL, "https://ration.mayutic.com/s/keep")
        XCTAssertNotNil(controller.errorMessage)
    }

    func testCancelDropsInFlightLoad() async {
        let controller = ShareLinkController()
        let gate = AsyncGate()
        controller.loadStatus {
            await gate.wait()
            return ShareStatusResponse(shareUrl: "https://ration.mayutic.com/s/late", shareExpiresAt: nil)
        }
        controller.cancel()
        await gate.open()
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertNil(controller.shareURL)
    }

    private func waitUntil(
        timeoutNanoseconds: UInt64 = 1_000_000_000,
        _ predicate: @escaping () -> Bool
    ) async {
        let start = DispatchTime.now().uptimeNanoseconds
        while !predicate() {
            if DispatchTime.now().uptimeNanoseconds - start > timeoutNanoseconds {
                XCTFail("Timed out waiting for condition")
                return
            }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
    }
}

private actor AsyncGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { continuation in
            waiters.append(continuation)
        }
    }

    func open() {
        isOpen = true
        let pending = waiters
        waiters = []
        for waiter in pending {
            waiter.resume()
        }
    }
}
