import SwiftUI

/// Loads images from Ration API routes that may require Bearer auth (org logos).
@MainActor
@Observable
final class AuthImageLoader {
    static let shared = AuthImageLoader()

    private var cache: [URL: UIImage] = [:]
    private var inFlight: [URL: Task<UIImage?, Never>] = [:]

    func image(for url: URL, auth: AuthManager) async -> UIImage? {
        if let cached = cache[url] { return cached }

        if let existing = inFlight[url] {
            return await existing.value
        }

        let task = Task<UIImage?, Never> {
            await fetch(url: url, auth: auth)
        }
        inFlight[url] = task
        let result = await task.value
        inFlight[url] = nil
        if let result { cache[url] = result }
        return result
    }

    func invalidate(url: URL) {
        cache.removeValue(forKey: url)
    }

    private func fetch(url: URL, auth: AuthManager) async -> UIImage? {
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let token = try await auth.validAccessToken()
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let image = UIImage(data: data)
            else { return nil }
            return image
        } catch {
            return nil
        }
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
