import SwiftUI

/// Loads images from Ration API routes that may require Bearer auth (org logos).
@MainActor
@Observable
final class AuthImageLoader {
    static let shared = AuthImageLoader()

    private let session: URLSession
    private let memoryCache = NSCache<NSURL, UIImage>()
    private var inFlight: [URL: Task<UIImage?, Never>] = [:]

    init(session: URLSession? = nil) {
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.ephemeral
            config.urlCache = nil
            config.requestCachePolicy = .reloadIgnoringLocalCacheData
            self.session = URLSession(configuration: config)
        }
        memoryCache.countLimit = 50
        memoryCache.totalCostLimit = 12 * 1024 * 1024
    }

    func image(for url: URL, auth: AuthManager) async -> UIImage? {
        if let cached = memoryCache.object(forKey: url as NSURL) {
            return cached
        }

        if let existing = inFlight[url] {
            return await existing.value
        }

        let task = Task<UIImage?, Never> {
            await fetch(url: url, auth: auth)
        }
        inFlight[url] = task
        let result = await task.value
        if inFlight[url] == task {
            inFlight[url] = nil
        }
        // Check the fetch task itself — caller Task.isCancelled is unrelated (logout race).
        guard !task.isCancelled else { return nil }
        if let result {
            memoryCache.setObject(result, forKey: url as NSURL, cost: result.authImageCost)
        }
        return result
    }

    func invalidate(url: URL) {
        memoryCache.removeObject(forKey: url as NSURL)
    }

    /// Drops every cached authenticated image — called on forced logout (H-2)
    /// so another user signing in on the same device can't see a stale
    /// cached org logo/avatar rendered from the previous account's session.
    func clearAll() {
        for (_, task) in inFlight {
            task.cancel()
        }
        inFlight.removeAll()
        memoryCache.removeAllObjects()
    }

    /// Test seam: seed NSCache without a network round-trip.
    func seedCacheForTesting(_ image: UIImage, for url: URL) {
        memoryCache.setObject(image, forKey: url as NSURL, cost: image.authImageCost)
    }

    /// Test seam: inspect NSCache without exposing a strong dictionary mirror.
    func cachedImageForTesting(_ url: URL) -> UIImage? {
        memoryCache.object(forKey: url as NSURL)
    }

    private func fetch(url: URL, auth: AuthManager) async -> UIImage? {
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let token = try await auth.validAccessToken()
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let image = UIImage(data: data)
            else { return nil }
            return image
        } catch {
            return nil
        }
    }
}

private extension UIImage {
    var authImageCost: Int {
        Int(size.width * size.height * scale * scale * 4)
    }
}

struct AuthImageView<Fallback: View>: View {
    @Environment(AppEnvironment.self) private var env
    let url: URL
    @ViewBuilder let fallback: () -> Fallback

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                fallback()
            }
        }
        .task(id: url) {
            image = await AuthImageLoader.shared.image(for: url, auth: env.auth)
        }
    }
}
