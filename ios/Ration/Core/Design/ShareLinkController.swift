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
    private var mutationTask: Task<Void, Never>?

    func cancel() {
        statusTask?.cancel()
        statusTask = nil
        mutationTask?.cancel()
        mutationTask = nil
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
        _ create: @escaping () async throws -> ShareCreateResponse,
        onForbidden: @escaping (APIError) -> PaywallContext?
    ) async -> PaywallContext? {
        statusTask?.cancel()
        statusTask = nil
        mutationTask?.cancel()
        errorMessage = nil

        var paywall: PaywallContext?
        let task = Task { @MainActor in
            do {
                let response = try await create()
                guard !Task.isCancelled else { return }
                shareURL = response.shareUrl
                shareExpiresAt = response.shareExpiresAt
                Haptics.success()
            } catch is CancellationError {
                return
            } catch let error as APIError {
                guard !Task.isCancelled else { return }
                if let ctx = onForbidden(error) {
                    paywall = ctx
                    return
                }
                errorMessage = error.errorDescription
            } catch {
                guard !Task.isCancelled else { return }
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
        mutationTask = task
        await task.value
        if mutationTask == task { mutationTask = nil }
        return paywall
    }

    func revoke(_ revoke: @escaping () async throws -> ShareRevokeResponse) async {
        statusTask?.cancel()
        statusTask = nil
        mutationTask?.cancel()
        errorMessage = nil

        let task = Task { @MainActor in
            do {
                _ = try await revoke()
                guard !Task.isCancelled else { return }
                shareURL = nil
                shareExpiresAt = nil
                Haptics.light()
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else { return }
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
        }
        mutationTask = task
        await task.value
        if mutationTask == task { mutationTask = nil }
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
