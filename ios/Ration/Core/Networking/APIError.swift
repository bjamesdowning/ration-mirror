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
    /// Access token was refreshed after a 401, but the original mutating request was not replayed.
    case retryableUnauthorized
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
        case .retryableUnauthorized:
            return "Your session was refreshed. Please try that action again."
        case let .server(_, message, _, _, _, _, _, _, _, _):
            return message ?? "Something went wrong. Please try again."
        case .decoding:
            return "Unexpected response from server."
        case .transport:
            return "Network error. Please try again."
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

    /// 400 — group still has credits; client must acknowledge non-refundable forfeiture.
    var isCreditForfeitUnacknowledged: Bool {
        guard statusCode == 400 else { return false }
        return code == "credit_forfeit_unacknowledged"
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

    /// 403 Flagship gate from `assertFeatureEnabled` (e.g. `nutrition-goals`, `nutrition-cook-log-split`
    /// off, or a fail-closed default). Server sends `code: "FEATURE_DISABLED"`.
    var isFeatureDisabled: Bool {
        guard statusCode == 403 else { return false }
        return code == "FEATURE_DISABLED"
    }

    /// 403 nutrition consent gate — show the versioned privacy statement,
    /// record consent through `/privacy/nutrition`, then retry the write.
    var isNutritionConsentRequired: Bool {
        guard statusCode == 403 else { return false }
        return code == "nutrition_consent_required"
    }

    /// 422 — meal has no usable nutrition snapshot; Eat cannot compute a serving.
    var isNutritionUnavailable: Bool {
        guard statusCode == 422 else { return false }
        return code == "nutrition_unavailable"
    }

    /// 409 — meal nutrition recompute still pending; retry shortly.
    var isNutritionUpdating: Bool {
        guard statusCode == 409 else { return false }
        return code == "nutrition_updating"
    }

    /// Stable machine code for Sign In when no Ration user exists yet.
    static let accountNotFoundCode = "account_not_found"
    static let accountNotFoundDefaultMessage =
        "No account found. Create an account instead."

    var isAccountNotFound: Bool {
        code == Self.accountNotFoundCode
    }

    /// 503 D1 contention / overload — retry shortly; not a credential failure.
    /// Match the `server_busy` code only: other 503s (`no_organization`) are
    /// setup failures and must not trigger a Sign In busy-retry.
    var isServerBusy: Bool {
        code == "server_busy"
    }

    /// Maps a non-2xx mobile API envelope. Preserves machine `code` so Sign In
    /// `account_not_found` is not collapsed to a generic session-expired 401.
    static func fromHTTP(status: Int, body: APIErrorBody?) -> APIError {
        let code = body?.code
        let message = body?.error ?? body?.message
        if let code, !code.isEmpty {
            return .server(status: status, message: message, code: code)
        }
        if status == 401 {
            return .unauthorized
        }
        return .server(status: status, message: message, code: nil)
    }
}
