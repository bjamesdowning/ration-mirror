import Foundation

/// Error envelope returned by `/api/mobile/v1/*` — `{ error, code, ... }`.
struct APIErrorBody: Codable, Sendable {
    let error: String?
    let code: String?
    let existingMealId: String?
    let existingMealName: String?
}

enum APIError: Error, LocalizedError, Sendable {
    case unauthorized
    case server(
        status: Int,
        message: String?,
        code: String?,
        existingMealId: String? = nil,
        existingMealName: String? = nil
    )
    case decoding(String)
    case transport(String)
    case notAuthenticated

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Your session expired. Please sign in again."
        case let .server(_, message, _, _, _):
            return message ?? "Something went wrong. Please try again."
        case let .decoding(detail):
            return "Unexpected response from server. (\(detail))"
        case let .transport(detail):
            return "Network error. \(detail)"
        case .notAuthenticated:
            return "Please sign in to continue."
        }
    }

    /// Stable machine code (e.g. `billing_unavailable`, `active_app_store_subscription`).
    var code: String? {
        if case let .server(_, _, code, _, _) = self { return code }
        return nil
    }

    var statusCode: Int? {
        if case let .server(status, _, _, _, _) = self { return status }
        return nil
    }

    var existingMealId: String? {
        if case let .server(_, _, _, mealId, _) = self { return mealId }
        return nil
    }

    var existingMealName: String? {
        if case let .server(_, _, _, _, mealName) = self { return mealName }
        return nil
    }
}
