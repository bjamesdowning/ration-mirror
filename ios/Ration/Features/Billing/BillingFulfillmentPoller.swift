import Foundation

/// Polls billing status briefly after a RevenueCat purchase until webhook fulfillment is visible.
enum BillingFulfillmentPoller {
    static func poll(
        baseline: BillingStatus?,
        creditPack: Bool,
        maxAttempts: Int = 4,
        delayNanoseconds: UInt64 = 1_200_000_000,
        fetchStatus: () async throws -> BillingStatus,
        sleep: (UInt64) async throws -> Void = { try await Task.sleep(nanoseconds: $0) }
    ) async throws -> BillingStatus {
        var latest = try await fetchStatus()
        for _ in 0..<maxAttempts {
            if fulfillmentVisible(latest, baseline: baseline, creditPack: creditPack) {
                break
            }
            try await sleep(delayNanoseconds)
            latest = try await fetchStatus()
        }
        return latest
    }

    /// Subscriptions early-exit when `crew_member` is active; credit packs
    /// early-exit when org credits rise above the pre-purchase baseline.
    static func fulfillmentVisible(
        _ latest: BillingStatus,
        baseline: BillingStatus?,
        creditPack: Bool
    ) -> Bool {
        if creditPack {
            let before = baseline?.credits ?? 0
            return latest.credits > before
        }
        return latest.entitlements.crew_member.active
    }
}
