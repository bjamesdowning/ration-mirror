import Foundation

// MARK: - Copilot

/// `GET /api/mobile/v1/copilot/status`
struct CopilotStatusResponse: Codable, Sendable {
    let tier: String
    let freeConversationsRemaining: Int
    let allowanceResetAt: Date
    let creditBalance: Int
    let autoDeductConsent: Bool
    let conversationFloorCost: Int
    let sessionIdleMs: Int
    let tokensPerCredit: Int
    let sessionMaxTokens: Int
    let onboardingBriefingEligible: Bool?
    let onboardingBriefingConsumed: Bool?

    var canUseOnboardingBriefing: Bool {
        onboardingBriefingEligible == true && onboardingBriefingConsumed != true
    }
}

struct CopilotConsentRequest: Encodable {
    let autoDeductConsent: Bool
}

struct CopilotSessionUsage: Codable, Sendable, Equatable {
    let totalTokens: Int
    let maxTokens: Int
    let messageCount: Int
    let maxMessages: Int
    let creditsCharged: Int
    let creditBalance: Int
    let nextCreditAt: Int?
    let nextCreditThreshold: Int?

    /// Client meter must never regress within a conversation.
    static func mergeMonotonic(
        previous: CopilotSessionUsage?,
        incoming: CopilotSessionUsage
    ) -> CopilotSessionUsage {
        guard let previous else { return incoming }
        let totalTokens = max(previous.totalTokens, incoming.totalTokens)
        let creditsCharged = max(previous.creditsCharged, incoming.creditsCharged)
        let preferIncoming = incoming.totalTokens >= previous.totalTokens
        return CopilotSessionUsage(
            totalTokens: totalTokens,
            maxTokens: preferIncoming ? incoming.maxTokens : previous.maxTokens,
            messageCount: max(previous.messageCount, incoming.messageCount),
            maxMessages: preferIncoming ? incoming.maxMessages : previous.maxMessages,
            creditsCharged: creditsCharged,
            creditBalance: incoming.creditBalance,
            nextCreditAt: preferIncoming ? incoming.nextCreditAt : previous.nextCreditAt,
            nextCreditThreshold: preferIncoming
                ? incoming.nextCreditThreshold
                : previous.nextCreditThreshold
        )
    }
}

struct CopilotSessionLimitWarning: Codable, Sendable, Equatable {
    let severity: String
    let message: String

    var isUrgent: Bool { severity == "urgent" }
}

struct CopilotMessage: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let role: String
    var content: String
    let createdAt: Date?
    let toolCallId: String?
    var reasoning: String?
    var reasoningState: String?

    enum CodingKeys: String, CodingKey {
        case id
        case role
        case content
        case createdAt
        case toolCallId
    }

    init(
        id: String = UUID().uuidString,
        role: String,
        content: String,
        createdAt: Date? = Date(),
        toolCallId: String? = nil,
        reasoning: String? = nil,
        reasoningState: String? = nil
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
        self.toolCallId = toolCallId
        self.reasoning = reasoning
        self.reasoningState = reasoningState
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        role = try container.decode(String.self, forKey: .role)
        content = try container.decode(String.self, forKey: .content)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt)
        toolCallId = try container.decodeIfPresent(String.self, forKey: .toolCallId)
        reasoning = nil
        reasoningState = nil
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(role, forKey: .role)
        try container.encode(content, forKey: .content)
        try container.encodeIfPresent(createdAt, forKey: .createdAt)
        try container.encodeIfPresent(toolCallId, forKey: .toolCallId)
    }
}

struct CopilotToolStatus: Codable, Sendable, Equatable {
    let toolCallId: String
    let toolName: String
    let label: String
}

struct CopilotBlockedFeature: Codable, Sendable, Equatable {
    let feature: String
    let message: String
    let deepLink: String
}

struct CopilotToolError: Codable, Sendable, Equatable {
    let code: String
    let message: String
}

/// Streaming event envelope from the copilot socket. Unknown fields are ignored.
struct CopilotStreamEvent: Codable, Sendable {
    let type: String
    let message: CopilotMessage?
    let messageId: String?
    let text: String?
    let usageTokens: Int?
    let status: CopilotToolStatus?
    let toolCallId: String?
    let ok: Bool?
    let error: CopilotToolError?
    let approvalId: String?
    let toolName: String?
    let title: String?
    let description: String?
    let blocked: CopilotBlockedFeature?
    let usage: CopilotSessionUsage?
    let warning: CopilotSessionLimitWarning?

    init(
        type: String,
        message: CopilotMessage? = nil,
        messageId: String? = nil,
        text: String? = nil,
        usageTokens: Int? = nil,
        status: CopilotToolStatus? = nil,
        toolCallId: String? = nil,
        ok: Bool? = nil,
        error: CopilotToolError? = nil,
        approvalId: String? = nil,
        toolName: String? = nil,
        title: String? = nil,
        description: String? = nil,
        blocked: CopilotBlockedFeature? = nil,
        usage: CopilotSessionUsage? = nil,
        warning: CopilotSessionLimitWarning? = nil
    ) {
        self.type = type
        self.message = message
        self.messageId = messageId
        self.text = text
        self.usageTokens = usageTokens
        self.status = status
        self.toolCallId = toolCallId
        self.ok = ok
        self.error = error
        self.approvalId = approvalId
        self.toolName = toolName
        self.title = title
        self.description = description
        self.blocked = blocked
        self.usage = usage
        self.warning = warning
    }
}
