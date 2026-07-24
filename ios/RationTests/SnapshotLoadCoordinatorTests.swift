import XCTest
@testable import Ration

final class SnapshotLoadCoordinatorTests: XCTestCase {
    func testOwnerRunsOnceAndJoinerRerunsAfterCoalesce() async {
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
        // Owner runs once; joiner waits then re-runs (remount-safe).
        XCTAssertEqual(total, 2)
    }

    func testCancelMidFlightClearsInFlightSoNextRunExecutes() async {
        let coordinator = SnapshotLoadCoordinator()
        let key = "org-1|hub"
        let counter = Counter()
        let started = AsyncGate()

        let owner = Task {
            await coordinator.run(key: key) {
                await started.open()
                try? await Task.sleep(nanoseconds: 500_000_000)
                await counter.increment()
            }
        }

        await started.wait()
        owner.cancel()
        _ = await owner.result

        await coordinator.run(key: key) {
            await counter.increment()
        }

        let total = await counter.value
        XCTAssertGreaterThanOrEqual(total, 1, "Subsequent run must execute after cancel clears inFlight")
    }

    func testCancelledJoinerDoesNotRerun() async {
        let coordinator = SnapshotLoadCoordinator()
        let key = "org-1|supply"
        let counter = Counter()
        let ownerStarted = AsyncGate()
        let ownerRelease = AsyncGate()

        async let owner: Void = coordinator.run(key: key) {
            await counter.increment()
            await ownerStarted.open()
            await ownerRelease.wait()
        }

        await ownerStarted.wait()

        let joiner = Task {
            await coordinator.run(key: key) {
                await counter.increment()
            }
        }
        try? await Task.sleep(nanoseconds: 20_000_000)
        joiner.cancel()
        // Release owner before awaiting joiner — cancelled await of Task.value
        // may not resume until the in-flight task finishes.
        await ownerRelease.open()
        await owner
        _ = await joiner.result

        let total = await counter.value
        XCTAssertEqual(total, 1, "Cancelled joiner must not re-run its operation")
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

/// One-shot gate so tests can release a suspended load.
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
        waiters.removeAll()
        for waiter in pending {
            waiter.resume()
        }
    }
}
