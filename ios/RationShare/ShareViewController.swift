import UIKit
import UniformTypeIdentifiers

/// Lightweight share extension: capture a URL (or URL-in-text) and open Ration Import.
/// Heavy work stays in the host app — extension only hands off the URL.
final class ShareViewController: UIViewController {
    private static let appGroupId = "group.com.mayutic.ration"
    private static let pendingURLKey = "pendingImportURL"
    private static let pendingAtKey = "pendingImportURLAt"

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await handleShare() }
    }

    private func handleShare() async {
        defer {
            extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }

        guard let url = await extractSharedURL() else { return }

        if let defaults = UserDefaults(suiteName: Self.appGroupId) {
            defaults.set(url.absoluteString, forKey: Self.pendingURLKey)
            defaults.set(Date().timeIntervalSince1970, forKey: Self.pendingAtKey)
        }

        let encoded =
            url.absoluteString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
            ?? url.absoluteString
        guard let openURL = URL(string: "ration://galley/import?url=\(encoded)") else {
            return
        }

        openHostApp(openURL)
    }

    private func extractSharedURL() async -> URL? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
        for item in items {
            guard let providers = item.attachments else { continue }
            for provider in providers {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let url = await loadURL(from: provider, type: UTType.url.identifier)
                {
                    return url
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                   let text = await loadString(
                       from: provider,
                       type: UTType.plainText.identifier
                   ),
                   let url = firstHTTPSURL(in: text)
                {
                    return url
                }
                if provider.hasItemConformingToTypeIdentifier("public.url"),
                   let url = await loadURL(from: provider, type: "public.url")
                {
                    return url
                }
            }
        }
        return nil
    }

    private func loadURL(from provider: NSItemProvider, type: String) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                if let url = item as? URL {
                    continuation.resume(returning: url)
                } else if let string = item as? String, let url = URL(string: string) {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func loadString(from provider: NSItemProvider, type: String) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                continuation.resume(returning: item as? String)
            }
        }
    }

    private func firstHTTPSURL(in text: String) -> URL? {
        let detector = try? NSDataDetector(
            types: NSTextCheckingResult.CheckingType.link.rawValue
        )
        let range = NSRange(text.startIndex ..< text.endIndex, in: text)
        let match = detector?.firstMatch(in: text, options: [], range: range)
        guard let match, let url = match.url, url.scheme?.lowercased() == "https" else {
            return nil
        }
        return url
    }

    /// Opens the host app via the responder chain (Share Extension standard handoff).
    private func openHostApp(_ url: URL) {
        var responder: UIResponder? = self
        let selector = Selector(("openURL:"))
        while let current = responder {
            if current.responds(to: selector) {
                current.perform(selector, with: url)
                return
            }
            responder = current.next
        }
    }
}
