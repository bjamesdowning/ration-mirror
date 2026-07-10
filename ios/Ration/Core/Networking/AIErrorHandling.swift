import Foundation

enum AIErrorHandling {
    enum SubmitOutcome: Equatable {
        case paywall
        case failed(String)
    }

    static func mapSubmitError(_ error: Error) -> SubmitOutcome? {
        guard let apiError = error as? APIError else { return nil }
        if apiError.statusCode == 402 {
            return .paywall
        }
        return nil
    }

    static func refreshCredits(session: SessionStore, api: RationAPI) async {
        await session.load(api: api)
    }
}
