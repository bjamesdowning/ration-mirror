import Foundation

/// Retries a mutating API call once after `APIError.retryableUnauthorized`.
///
/// `APIClient` refreshes the access token on 401 but does not auto-replay
/// non-idempotent methods. Callers wrap mutations here so the user intent
/// succeeds transparently after session rotation.
enum MutationRetry {
    static func once<T: Sendable>(
        _ operation: () async throws -> T
    ) async throws -> T {
        do {
            return try await operation()
        } catch APIError.retryableUnauthorized {
            return try await operation()
        }
    }
}
