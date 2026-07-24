import Foundation
import Observation

@MainActor
@Observable
final class SettingsSessionViewModel {
    private(set) var session: SessionResponse?
    private(set) var settings: UserSettings?
    private(set) var isLoading = false
    var errorMessage: String?

    func load(api: RationAPI) async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let sessionTask = api.session()
            async let settingsTask = api.settings()
            session = try await sessionTask
            settings = try await settingsTask.settings
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
