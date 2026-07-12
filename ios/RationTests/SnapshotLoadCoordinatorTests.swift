import XCTest
@testable import Ration

final class SnapshotLoadCoordinatorTests: XCTestCase {
    func testCoalescesConcurrentLoads() async {
        let coordinator = SnapshotLoadCoordinator()
        let key = "org-1|cargo"
        let counter = Counter()

        async let first: Void = coordinator.run(key: key) {
            await counter.increment()
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        try? await Task.sleep(nanoseconds: 10_000_000)
        async let second: Void = coordinator.run(key: key) {
            await counter.increment()
        }

        await first
        await second
        let total = await counter.value
        XCTAssertEqual(total, 1)
    }

    func testKeyFormat() {
        XCTAssertEqual(
            SnapshotLoadCoordinator.key(organizationId: "org-a", domain: "hub"),
            "org-a|hub"
        )
    }
}

private actor Counter {
    private(set) var value = 0

    func increment() {
        value += 1
    }
}
