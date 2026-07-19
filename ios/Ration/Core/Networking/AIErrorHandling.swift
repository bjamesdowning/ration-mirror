import Foundation

enum AIErrorHandling {
    enum SubmitOutcome: Equatable {
        case paywall
        case featureDisabled
        case failed(String)
    }

    static func mapSubmitError(_ error: Error) -> SubmitOutcome? {
        guard let apiError = error as? APIError else { return nil }
        if apiError.statusCode == 402 {
            return .paywall
        }
        if apiError.statusCode == 403, apiError.code == "FEATURE_DISABLED" {
            return .featureDisabled
        }
        return nil
    }

    static let featureDisabledMessage = "This feature is temporarily unavailable."

    static func refreshCredits(session: SessionStore, api: RationAPI) async {
        await session.load(api: api)
    }
}
