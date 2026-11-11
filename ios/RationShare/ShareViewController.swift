import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Share extension: save a URL for Ration. Flag off does not submit.
/// The containing app reads the App Group payload the next time it is opened.
final class ShareViewController: UIViewController {
    private static let appGroupId = "group.com.mayutic.ration"
    private static let pendingURLKey = "pendingImportURL"
    private static let pendingAtKey = "pendingImportURLAt"
    private static let pendingAutoStartKey = "pendingImportAutoStart"
    private static let pendingUserTextKey = "pendingImportUserText"

    /// Ceramic background — mirrors Theme.ceramic (light #F8F9FA / dark #0D0D0D).
    private static let ceramicBackground = UIColor { traits in
        if traits.userInterfaceStyle == .dark {
            return UIColor(red: 0.051, green: 0.051, blue: 0.051, alpha: 1)
        }
        return UIColor(red: 0.973, green: 0.976, blue: 0.980, alpha: 1)
    }

    /// Carbon text — mirrors Theme.carbon (light #111 / dark #F8F9FA).
    private static let carbonForeground = UIColor { traits in
        if traits.userInterfaceStyle == .dark {
            return UIColor(red: 0.973, green: 0.976, blue: 0.980, alpha: 1)
        }
        return UIColor(white: 0.067, alpha: 1)
    }

    private static let mutedForeground = UIColor { traits in
        if traits.userInterfaceStyle == .dark {
            return UIColor(red: 0.612, green: 0.639, blue: 0.686, alpha: 1) // #9CA3AF
        }
        return UIColor(red: 0.420, green: 0.447, blue: 0.502, alpha: 1) // #6B7280
    }

    private var didStart = false
    private var statusLabel: UILabel?
    private var doneButton: UIButton?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.ceramicBackground
        buildChrome()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        guard !didStart else { return }
        didStart = true
        Task { await handleShare() }
    }

    private func buildChrome() {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        let label = UILabel()
        label.text = "Sending to Ration…"
        label.font = UIFont.monospacedSystemFont(ofSize: 15, weight: .medium)
        label.textColor = Self.carbonForeground
        label.textAlignment = .center
        label.numberOfLines = 0
        statusLabel = label
        stack.addArrangedSubview(label)

        var doneConfig = UIButton.Configuration.plain()
        doneConfig.title = "Done"
        doneConfig.baseForegroundColor = Self.mutedForeground
        let done = UIButton(configuration: doneConfig)
        done.isHidden = true
        done.addTarget(self, action: #selector(finish), for: .touchUpInside)
        doneButton = done
        stack.addArrangedSubview(done)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    private func handleShare() async {
        guard let extracted = await extractSharedPayload() else {
            statusLabel?.text =
                "No link found in this share. Copy the recipe URL and paste it in Ration → Import."
            doneButton?.isHidden = false
            return
        }

        let defaults = UserDefaults(suiteName: Self.appGroupId)
        let flagOn = SharedImportStore.flagEnabled(defaults)
        if !flagOn {
            persistPending(url: extracted.url, userText: extracted.userText, autoStart: true)
            statusLabel?.text = ShareImportCopy.savedForLater
            doneButton?.isHidden = false
            return
        }
        persistPending(url: extracted.url, userText: extracted.userText, autoStart: false)
        presentImport(url: extracted.url, userText: extracted.userText)
    }

    private func presentImport(url: URL, userText: String?) {
        statusLabel?.isHidden = true
        doneButton?.isHidden = true
        let root = ShareImportView(url: url, userText: userText) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
        let host = UIHostingController(rootView: root)
        host.view.backgroundColor = Self.ceramicBackground
        host.view.translatesAutoresizingMaskIntoConstraints = false
        addChild(host)
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
    }

    @objc private func finish() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    private func persistPending(url: URL, userText: String?, autoStart: Bool) {
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else { return }
        defaults.set(url.absoluteString, forKey: Self.pendingURLKey)
        defaults.set(Date().timeIntervalSince1970, forKey: Self.pendingAtKey)
        defaults.set(autoStart, forKey: Self.pendingAutoStartKey)
        if let userText, !userText.isEmpty {
            defaults.set(userText, forKey: Self.pendingUserTextKey)
        } else {
            defaults.removeObject(forKey: Self.pendingUserTextKey)
        }
    }

    private func extractSharedPayload() async -> (url: URL, userText: String?)? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
        var foundURL: URL?
        var texts: [String] = []
        for item in items {
            if let text = item.attributedContentText?.string ?? item.attributedTitle?.string,
               !text.isEmpty
            {
                texts.append(text)
            }
            guard let providers = item.attachments else { continue }
            for provider in providers {
                if foundURL == nil, let url = await loadURLObject(from: provider) {
                    foundURL = httpsOrNil(url)
                }
                if foundURL == nil,
                   provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let url = await loadURL(from: provider, type: UTType.url.identifier)
                {
                    foundURL = httpsOrNil(url)
                }
                // public.plain-text conforms to public.text, so one load covers both.
                if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier),
                   let text = await loadString(from: provider, type: UTType.text.identifier)
                {
                    texts.append(text)
                    if foundURL == nil {
                        foundURL = firstHTTPSURL(in: text)
                    }
                }
            }
            if foundURL == nil,
               let text = item.attributedContentText?.string ?? item.attributedTitle?.string,
               let url = firstHTTPSURL(in: text)
            {
                foundURL = url
            }
        }
        guard let url = foundURL else { return nil }
        let caption = captionExcludingURL(from: texts, url: url)
        return (url, caption)
    }

    private func captionExcludingURL(from texts: [String], url: URL) -> String? {
        let urlString = url.absoluteString
        var combined = texts.joined(separator: "\n")
        combined = combined.replacingOccurrences(of: urlString, with: "")
        combined = combined.trimmingCharacters(in: .whitespacesAndNewlines)
        if combined.count < 8 { return nil }
        return String(combined.prefix(8000))
    }

    private func httpsOrNil(_ url: URL) -> URL? {
        let scheme = url.scheme?.lowercased()
        if scheme == "https" || scheme == "http" {
            if scheme == "http",
               var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            {
                components.scheme = "https"
                return components.url ?? url
            }
            return url
        }
        return nil
    }

    private func loadURLObject(from provider: NSItemProvider) async -> URL? {
        guard provider.canLoadObject(ofClass: URL.self) else { return nil }
        return await withCheckedContinuation { continuation in
            _ = provider.loadObject(ofClass: URL.self) { url, _ in
                continuation.resume(returning: url)
            }
        }
    }

    private func loadURL(from provider: NSItemProvider, type: String) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                if let url = item as? URL {
                    continuation.resume(returning: url)
                } else if let string = item as? String,
                          let url = URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines))
                {
                    continuation.resume(returning: url)
                } else if let data = item as? Data,
                          let string = String(data: data, encoding: .utf8),
                          let url = URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines))
                {
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
                if let string = item as? String {
                    continuation.resume(returning: string)
                } else if let data = item as? Data,
                          let string = String(data: data, encoding: .utf8)
                {
                    continuation.resume(returning: string)
                } else if let attr = item as? NSAttributedString {
                    continuation.resume(returning: attr.string)
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func firstHTTPSURL(in text: String) -> URL? {
        let detector = try? NSDataDetector(
            types: NSTextCheckingResult.CheckingType.link.rawValue
        )
        let range = NSRange(text.startIndex ..< text.endIndex, in: text)
        let match = detector?.firstMatch(in: text, options: [], range: range)
        guard let match, let url = match.url else { return nil }
        return httpsOrNil(url)
    }

}
