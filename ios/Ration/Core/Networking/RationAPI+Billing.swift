import Foundation

extension RationAPI {
    // Billing
    func billingStatus() async throws -> BillingStatus {
        try await client.get("billing/status")
    }

}
