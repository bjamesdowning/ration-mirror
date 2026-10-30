import Foundation

/// The server's `426 upgrade_required` answer: this build is below the supported minimum.
struct AppUpdateRequirement: Equatable, Sendable {
    static let code = "upgrade_required"
    static let appStoreFallbackURL = URL(string: "https://apps.apple.com/app/id6785010110")!

    let message: String
    let appStoreURL: URL

    init?(status: Int, body: APIErrorBody?) {
        guard status == 426, body?.code == Self.code else { return nil }
        message = body?.error ?? body?.message
            ?? String(localized: "Update Ration from the App Store to keep going.")
        appStoreURL = body?.appStoreUrl.flatMap(URL.init(string:)) ?? Self.appStoreFallbackURL
    }
}
