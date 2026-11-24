import Foundation
import Security

/// Copy shared by the Share Extension and the in-app consent screen.
enum ShareImportCopy {
    static let disclosure =
        "Scan, meal generation, recipe import, Plan week, and Ask Ration send the photos, text, links, and kitchen details you use with them to Google Gemini (via Cloudflare AI Gateway) to produce results. Recipe imports also send the link to Supadata to read the page. Credits are used automatically when your Crew allowance runs out."
    static let allowAndImport = "Allow and import"
    static let addToGalley = "Add to Galley"
    static let addedToGalley = "Added to Galley"
    static let importStarted = "Import started"
    static let importingTitle = "Importing recipe…"
    static let importingBody =
        "Ration is importing this link. AI is reading the recipe. It keeps going after you leave, and it is in Ration the next time you open the app."
    static let openRation = "Open Ration"
    static let openRationRefused =
        "Ration could not open from here. Open the Ration app from your Home Screen. This import is waiting there."
    static func preparing(host: String, cost: Int?) -> String {
        if let cost {
            return "Preparing import from \(host). This import uses \(cost) credits."
        }
        return "Preparing import from \(host)."
    }

    static func switchKitchen(_ name: String) -> String {
        "This import belongs to \(name). Switch to that kitchen to finish it."
    }
    static let unavailable = "Recipe import is unavailable."
    static let readingPage = "Reading page"
    static let listeningToVideo = "Listening to video"
    static let buildingRecipe = "Building recipe"
    static let savedForLater =
        "Saved to Ration for 24 hours. Open Ration from your Home Screen to continue."
    static let signedOut =
        "Saved to Ration for 24 hours. Sign in to Ration to continue."
    static let offline = "You are offline. The link stays saved for 24 hours."
    static let rateLimited = "Too many import requests. Try again in a few minutes."
    static let unauthorized = "Sign in to Ration again from the Home Screen to continue."
    static let queueFull =
        "Ration already has 10 saved shares. Finish one in Ration, then share again."
    static let siteBlocked =
        "This site needs Ration open. Open Ration from your Home Screen to finish."

    static func insufficientCredits(required: Int) -> String {
        "This import uses \(required) credits. Open Ration from your Home Screen to add credits."
    }

    static let addByHand =
        "This kitchen does not have enough credits. You can add the meal by hand in Ration."
}

enum ShareImportState: Equatable, Sendable {
    case idle
    case preparing(host: String, cost: Int?)
    case needsConsent
    case unavailable
    case needsCredits(required: Int)
    case signedOut
    case offline
    case unauthorized
    case rateLimited
    case duplicate(name: String?)
    case failed(String)
    case siteBlocked
    case progress(String)
    case started
    case readyToAdd
    case addedToGalley
    case queueFull
    case chooseKitchen(host: String, cost: Int, selectedId: String)
}

struct ShareImportRecord: Codable, Equatable, Sendable {
    var version: Int
    var id: String
    var clientRequestId: String
    var url: String
    var userText: String?
    var savedAt: TimeInterval
    /// saved, bound, submitting, processing, needsApp, confirmed, failed, discarded
    var state: String
    var ownerUserId: String?
    var organizationId: String?
    var organizationName: String?
    var requestId: String?
    var acknowledged: Bool
    var sessionEpoch: Int

    init(
        version: Int = 1,
        id: String,
        clientRequestId: String,
        url: String,
        userText: String?,
        savedAt: TimeInterval,
        state: String,
        ownerUserId: String? = nil,
        organizationId: String? = nil,
        organizationName: String? = nil,
        requestId: String? = nil,
        acknowledged: Bool = false,
        sessionEpoch: Int = 0
    ) {
        self.version = version
        self.id = id
        self.clientRequestId = clientRequestId
        self.url = url
        self.userText = userText
        self.savedAt = savedAt
        self.state = state
        self.ownerUserId = ownerUserId
        self.organizationId = organizationId
        self.organizationName = organizationName
        self.requestId = requestId
        self.acknowledged = acknowledged
        self.sessionEpoch = sessionEpoch
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
        id = try container.decode(String.self, forKey: .id)
        clientRequestId = try container.decodeIfPresent(String.self, forKey: .clientRequestId) ?? id
        url = try container.decode(String.self, forKey: .url)
        userText = try container.decodeIfPresent(String.self, forKey: .userText)
        savedAt = try container.decode(TimeInterval.self, forKey: .savedAt)
        state = try container.decodeIfPresent(String.self, forKey: .state) ?? "saved"
        ownerUserId = try container.decodeIfPresent(String.self, forKey: .ownerUserId)
        organizationId = try container.decodeIfPresent(String.self, forKey: .organizationId)
        organizationName = try container.decodeIfPresent(String.self, forKey: .organizationName)
        requestId = try container.decodeIfPresent(String.self, forKey: .requestId)
        acknowledged = try container.decodeIfPresent(Bool.self, forKey: .acknowledged) ?? false
        sessionEpoch = try container.decodeIfPresent(Int.self, forKey: .sessionEpoch) ?? 0
    }
}

struct ShareImportKitchen: Equatable, Sendable, Identifiable {
    var id: String
    var name: String
    var credits: Int
}

struct ShareImportSessionSnapshot: Equatable, Sendable {
    var userId: String
    var organizationId: String
    var organizationName: String
    var membershipIds: [String]
    var credits: Int
    var importCost: Int
    var hasConsent: Bool
    var shareExtensionImport: Bool
    var aiImportWeb: Bool
    var aiImportSocial: Bool
    var kitchens: [ShareImportKitchen] = []
    var shareImportKitchenPicker: Bool = false
}

struct ShareImportSubmitBody: Equatable, Sendable {
    var clientRequestId: String
    var url: String
    var userText: String?
    var organizationId: String? = nil
}

struct ShareImportJobSnapshot: Equatable, Sendable {
    var status: String
    var progress: String?
    var code: String?
    var error: String?
    var existingMealName: String?
    var mealName: String?
    var needsVerification: Bool
}

enum ShareImportServiceError: Error, Equatable {
    case offline
    case timedOut
    case unauthorized
    case rateLimited
    case notFound
    case duplicate(name: String?)
    case unavailable
    case insufficientCredits(required: Int)
    case failed(String)
    case siteBlocked
    case http(Int)
}

enum ShareImportLane {
    private static let socialHosts = [
        "youtube.com", "youtu.be", "instagram.com", "tiktok.com",
        "facebook.com", "fb.watch", "x.com", "twitter.com",
    ]

    static func isSocial(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return socialHosts.contains { host == $0 || host.hasSuffix(".\($0)") }
    }

    static func isEnabled(url: URL, session: ShareImportSessionSnapshot) -> Bool {
        guard session.shareExtensionImport else { return false }
        if isSocial(url) { return session.aiImportSocial }
        return session.aiImportWeb
    }
}

enum ShareImportProgressLabel {
    static func label(for progress: String?) -> String? {
        switch progress {
        case "reading_page": ShareImportCopy.readingPage
        case "listening_to_video": ShareImportCopy.listeningToVideo
        case "extracting": ShareImportCopy.buildingRecipe
        case ShareImportCopy.readingPage, ShareImportCopy.listeningToVideo, ShareImportCopy.buildingRecipe:
            progress
        default:
            nil
        }
    }
}

enum ShareImportResumeAction: Equatable, Sendable {
    /// The server already has this id, or the extension had started the POST.
    /// `allowDeviceCapture` is true only for a page the extension saved as `needsApp`.
    case resume(clientRequestId: String, allowDeviceCapture: Bool)
    /// Show the import screen. Do not submit until the person continues.
    case continueInKitchen(clientRequestId: String)
    case discard
    case switchKitchen(String)
    /// The row was never charged. Drop the kitchen and let this kitchen finish it.
    case retarget(clientRequestId: String)
}

enum ShareImportResume {
    static func isCharged(_ record: ShareImportRecord) -> Bool {
        if record.requestId != nil { return true }
        switch record.state {
        case "submitting", "processing", "needsApp", "confirmed":
            return true
        default:
            return false
        }
    }

    static func decide(
        record: ShareImportRecord,
        userId: String,
        organizationId: String,
        memberships: Set<String>,
        currentEpoch: Int
    ) -> ShareImportResumeAction {
        if record.acknowledged { return .discard }
        // A previous or signed-out session, including an unowned row inserted after logout.
        if record.sessionEpoch != currentEpoch {
            return .discard
        }
        if let owner = record.ownerUserId, owner != userId {
            return .discard
        }
        if let owner = record.ownerUserId, owner == userId,
           let recordOrg = record.organizationId, recordOrg != organizationId
        {
            if isCharged(record) {
                if memberships.contains(recordOrg) {
                    return .switchKitchen(record.organizationName ?? "the other kitchen")
                }
                return .discard
            }
            return .retarget(clientRequestId: record.clientRequestId)
        }
        let started = record.requestId != nil
            || record.state == "submitting"
            || record.state == "processing"
            || record.state == "needsApp"
        if started, record.ownerUserId == userId {
            return .resume(
                clientRequestId: record.clientRequestId,
                allowDeviceCapture: record.state == "needsApp"
            )
        }
        let currentSession = record.ownerUserId == nil || record.ownerUserId == userId
        guard currentSession else { return .discard }
        return .continueInKitchen(clientRequestId: record.clientRequestId)
    }
}

/// In-memory Galley chrome for a share notice. The alert latch is not the App Group row.
struct GalleyShareChrome: Equatable, Sendable {
    var alert: String?
    var actionsEnabled: Bool
    /// Dismissing the alert does not clear this. Only a release does.
    var locked: Bool

    static let usable = GalleyShareChrome(alert: nil, actionsEnabled: true, locked: false)

    var canAddMeal: Bool { actionsEnabled }
    var canGenerateMeal: Bool { actionsEnabled }
    var canImportMeal: Bool { actionsEnabled }

    func presentOwnershipAlert(_ message: String) -> GalleyShareChrome {
        GalleyShareChrome(alert: message, actionsEnabled: false, locked: true)
    }

    func dismissAlert() -> GalleyShareChrome {
        GalleyShareChrome(alert: nil, actionsEnabled: !locked, locked: locked)
    }

    func releasePendingImport() -> GalleyShareChrome {
        .usable
    }
}

enum ShareImportRecovery {
    struct Outcome: Equatable, Sendable {
        var action: ShareImportResumeAction
        var record: ShareImportRecord
        var chrome: GalleyShareChrome
    }

    static func recover(
        record: ShareImportRecord,
        userId: String,
        organizationId: String,
        memberships: Set<String>,
        currentEpoch: Int
    ) -> Outcome {
        let action = ShareImportResume.decide(
            record: record,
            userId: userId,
            organizationId: organizationId,
            memberships: memberships,
            currentEpoch: currentEpoch
        )
        switch action {
        case .retarget:
            var released = record
            released.organizationId = nil
            released.organizationName = nil
            if released.requestId == nil {
                released.state = "saved"
            }
            return Outcome(
                action: action,
                record: released,
                chrome: GalleyShareChrome.usable.releasePendingImport()
            )
        case .switchKitchen(let name):
            return Outcome(
                action: action,
                record: record,
                chrome: GalleyShareChrome(
                    alert: ShareImportCopy.switchKitchen(name),
                    actionsEnabled: true,
                    locked: false
                )
            )
        default:
            return Outcome(action: action, record: record, chrome: .usable)
        }
    }

    /// Ownership alert, dismiss leaves Galley dead, release is what frees it.
    static func unchargedMismatchSequence(
        record: ShareImportRecord,
        userId: String,
        organizationId: String,
        memberships: Set<String>,
        currentEpoch: Int
    ) -> (
        afterAlert: GalleyShareChrome,
        afterDismiss: GalleyShareChrome,
        afterRelease: Outcome
    ) {
        let name = record.organizationName ?? "the other kitchen"
        let afterAlert = GalleyShareChrome.usable.presentOwnershipAlert(
            ShareImportCopy.switchKitchen(name)
        )
        return (
            afterAlert,
            afterAlert.dismissAlert(),
            recover(
                record: record,
                userId: userId,
                organizationId: organizationId,
                memberships: memberships,
                currentEpoch: currentEpoch
            )
        )
    }
}

/// Shared Keychain item the app, widget, and Share Extension all use.
enum ShareImportKeychainPolicy {
    static let service = "com.mayutic.ration.auth"
    static let refreshAccount = "refresh_token"
    /// Same access group as the widget. Release never treats a missing entitlement as success.
    static let accessGroup = "M2KJH5GDGH.com.mayutic.ration"
    static let allowsMissingEntitlement = false

    static func accepted(_ status: OSStatus) -> Bool {
        status == errSecSuccess
    }
}
