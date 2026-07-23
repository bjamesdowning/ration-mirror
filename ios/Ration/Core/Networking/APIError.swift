import Foundation

/// Error envelope returned by `/api/mobile/v1/*` — `{ error, code, ... }`.
struct APIErrorBody: Codable, Sendable {
    let error: String?
    let message: String?
    let code: String?
    let limit: Int?
    let resource: String?
    let current: Int?
    let tier: String?
    let existingMealId: String?
    let existingMealName: String?
}

enum APIError: Error, LocalizedError, Sendable {
    case unauthorized
    case server(
        status: Int,
        message: String?,
        code: String?,
        errorCode: String? = nil,
        limit: Int? = nil,
        resource: String? = nil,
        current: Int? = nil,
        tier: String? = nil,
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
        case let .server(_, message, _, _, _, _, _, _, _, _):
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
        if case let .server(_, _, code, _, _, _, _, _, _, _) = self { return code }
        return nil
    }

    /// Machine error from API `error` field (e.g. `capacity_exceeded`).
    var serverErrorCode: String? {
        if case let .server(_, message, _, errorCode, _, _, _, _, _, _) = self {
            return errorCode ?? message
        }
        return nil
    }

    var serverLimit: Int? {
        if case let .server(_, _, _, _, limit, _, _, _, _, _) = self { return limit }
        return nil
    }

    var serverResource: String? {
        if case let .server(_, _, _, _, _, resource, _, _, _, _) = self { return resource }
        return nil
    }

    var serverCurrent: Int? {
        if case let .server(_, _, _, _, _, _, current, _, _, _) = self { return current }
        return nil
    }

    /// User or org tier from capacity payloads (e.g. owned_groups uses **user** tier).
    var serverTier: String? {
        if case let .server(_, _, _, _, _, _, _, tier, _, _) = self { return tier }
        return nil
    }

    var statusCode: Int? {
        if case let .server(status, _, _, _, _, _, _, _, _, _) = self { return status }
        return nil
    }

    var existingMealId: String? {
        if case let .server(_, _, _, _, _, _, _, _, mealId, _) = self { return mealId }
        return nil
    }

    var existingMealName: String? {
        if case let .server(_, _, _, _, _, _, _, _, _, mealName) = self { return mealName }
        return nil
    }

    /// 403 capacity gate — structured `capacity_exceeded` or string prefix form.
    var isCapacityExceeded: Bool {
        guard statusCode == 403 else { return false }
        let code = serverErrorCode ?? ""
        return code == "capacity_exceeded" || code.hasPrefix("capacity_exceeded:")
    }

    /// 403 feature gate (invites, share links, etc.).
    var isFeatureGated: Bool {
        guard statusCode == 403 else { return false }
        let code = serverErrorCode ?? code ?? ""
        return code == "feature_gated"
    }
}
