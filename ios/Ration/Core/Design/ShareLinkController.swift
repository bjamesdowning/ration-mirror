import Foundation
import Observation

/// Shared load/create/revoke state for Manifest and Supply share links.
@MainActor
@Observable
final class ShareLinkController {
    private(set) var shareURL: String?
    private(set) var shareExpiresAt: String?
    private(set) var isLoading = false
    var errorMessage: String?
    private var statusTask: Task<Void, Never>?

    func cancel() {
        statusTask?.cancel()
        statusTask = nil
        isLoading = false
    }

    func loadStatus(_ fetch: @escaping () async throws -> ShareStatusResponse) {
        cancel()
        isLoading = true
        errorMessage = nil
        statusTask = Task {
            defer { isLoading = false }
            do {
                let status = try await fetch()
                guard !Task.isCancelled else { return }
                shareURL = status.shareUrl
                shareExpiresAt = status.shareExpiresAt
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else { return }
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
    }

    func create(
        _ create: () async throws -> ShareCreateResponse,
        onForbidden: (APIError) -> PaywallContext?
    ) async -> PaywallContext? {
        errorMessage = nil
        do {
            let response = try await create()
            shareURL = response.shareUrl
            shareExpiresAt = response.shareExpiresAt
            Haptics.success()
            return nil
        } catch let error as APIError {
            if let ctx = onForbidden(error) {
                return ctx
            }
            errorMessage = error.errorDescription
            return nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            return nil
        }
    }

    func revoke(_ revoke: () async throws -> ShareRevokeResponse) async {
        errorMessage = nil
        do {
            _ = try await revoke()
            shareURL = nil
            shareExpiresAt = nil
            Haptics.light()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Default paywall mapping shared by Supply and Manifest share create.
    static func paywallContext(from error: APIError, defaultResource: String = "share") -> PaywallContext? {
        if let ctx = CapacityUpgrade.context(from: error, defaultResource: defaultResource) {
            return ctx
        }
        if error.statusCode == 403 {
            return PaywallContext(trigger: .featureGate, resource: defaultResource)
        }
        return nil
    }
}
