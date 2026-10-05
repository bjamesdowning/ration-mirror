import Foundation

enum AppGroup {
    static let id = "group.com.mayutic.ration"

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
    }

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: id)
    }
}

/// Cross-process lock for token rotation and widget mutations.
enum AppGroupFileLock {
    static func perform<T>(
        _ name: String,
        _ work: () async throws -> T
    ) async throws -> T {
        guard let container = AppGroup.containerURL else {
            return try await work()
        }
        let url = container.appendingPathComponent(name)
        let fd = open(url.path, O_CREAT | O_RDWR, 0o600)
        if fd < 0 {
            return try await work()
        }
        defer { close(fd) }

        let deadline = Date().addingTimeInterval(12)
        while Date() < deadline {
            if flock(fd, LOCK_EX | LOCK_NB) == 0 {
                defer { flock(fd, LOCK_UN) }
                return try await work()
            }
            try await Task.sleep(nanoseconds: 40_000_000)
        }
        return try await work()
    }
}

/// API origin the signed-in app is using. The widget refuses non-local http.
enum WidgetAPIBase {
    private static let key = "widget.apiBase"
    static let production = URL(string: "https://ration.mayutic.com/api/mobile/v1")!

    static func publish(_ url: URL) {
        guard allows(url) else { return }
        AppGroup.defaults?.set(url.absoluteString, forKey: key)
    }

    static func resolve() -> URL {
        guard let raw = AppGroup.defaults?.string(forKey: key),
              let url = URL(string: raw),
              allows(url) else {
            return production
        }
        return url
    }

    static func allows(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased() else { return false }
        if scheme == "https" { return true }
        return scheme == "http" && (host == "localhost" || host == "127.0.0.1")
    }
}
