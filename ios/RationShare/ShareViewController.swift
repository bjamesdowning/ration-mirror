import UIKit
import UniformTypeIdentifiers

/// Lightweight share extension: capture a URL (or URL-in-text), persist via App Group,
/// then open Ration Import.
///
/// Host launch must use `open(_:options:completionHandler:)` on the responder chain.
/// The deprecated `openURL:` selector silently fails on iOS 18+ ("BUG IN CLIENT OF UIKIT"),
/// which dismissed the sheet with no app open — the bug users hit from TikTok/IG.
final class ShareViewController: UIViewController {
    private static let appGroupId = "group.com.mayutic.ration"
    private static let pendingURLKey = "pendingImportURL"
    private static let pendingAtKey = "pendingImportURLAt"

    private var didStart = false
    private var statusLabel: UILabel?
    private var openButton: UIButton?
    private var pendingOpenURL: URL?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.973, green: 0.976, blue: 0.980, alpha: 1) // Ceramic
        buildChrome()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
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
        label.textColor = UIColor(white: 0.067, alpha: 1) // Carbon
        label.textAlignment = .center
        label.numberOfLines = 0
        statusLabel = label
        stack.addArrangedSubview(label)

        var config = UIButton.Configuration.filled()
        config.baseBackgroundColor = UIColor(red: 0, green: 0.878, blue: 0.533, alpha: 1) // Hyper-Green
        config.baseForegroundColor = UIColor(white: 0.067, alpha: 1)
        config.title = "Open Ration"
        config.cornerStyle = .medium
        let button = UIButton(configuration: config)
        button.isHidden = true
        button.addTarget(self, action: #selector(retryOpenHost), for: .touchUpInside)
        openButton = button
        stack.addArrangedSubview(button)

        var doneConfig = UIButton.Configuration.plain()
        doneConfig.title = "Done"
        doneConfig.baseForegroundColor = UIColor(white: 0.067, alpha: 0.55)
        let done = UIButton(configuration: doneConfig)
        done.addTarget(self, action: #selector(finish), for: .touchUpInside)
        stack.addArrangedSubview(done)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    private func handleShare() async {
        guard let url = await extractSharedURL() else {
            await MainActor.run {
                statusLabel?.text =
                    "No link found in this share. Copy the recipe URL and paste it in Ration → Import."
                openButton?.isHidden = true
            }
            return
        }

        persistPendingURL(url)

        let encoded =
            url.absoluteString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
            ?? url.absoluteString
        guard let openURL = URL(string: "ration://galley/import?url=\(encoded)") else {
            await MainActor.run {
                statusLabel?.text = "Could not prepare Import link."
            }
            return
        }

        pendingOpenURL = openURL
        let opened = await openHostApp(openURL)
        if opened {
            // Give the system a beat to activate the host before tearing down.
            try? await Task.sleep(nanoseconds: 150_000_000)
            finish()
            return
        }

        await MainActor.run {
            statusLabel?.text =
                "Link saved. Open Ration to import — or tap below if it didn’t switch automatically."
            openButton?.isHidden = false
        }
    }

    @objc private func retryOpenHost() {
        guard let openURL = pendingOpenURL else { return }
        Task {
            let opened = await openHostApp(openURL)
            if opened {
                try? await Task.sleep(nanoseconds: 150_000_000)
                finish()
            }
        }
    }

    @objc private func finish() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    private func persistPendingURL(_ url: URL) {
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else { return }
        defaults.set(url.absoluteString, forKey: Self.pendingURLKey)
        defaults.set(Date().timeIntervalSince1970, forKey: Self.pendingAtKey)
        defaults.synchronize()
    }

    private func extractSharedURL() async -> URL? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
        for item in items {
            guard let providers = item.attachments else { continue }
            for provider in providers {
                if let url = await loadURLObject(from: provider) {
                    return httpsOrNil(url)
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let url = await loadURL(from: provider, type: UTType.url.identifier)
                {
                    return httpsOrNil(url)
                }
                if provider.hasItemConformingToTypeIdentifier("public.url"),
                   let url = await loadURL(from: provider, type: "public.url")
                {
                    return httpsOrNil(url)
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
                if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier),
                   let text = await loadString(from: provider, type: UTType.text.identifier),
                   let url = firstHTTPSURL(in: text)
                {
                    return url
                }
            }
            // Some hosts put the URL in attributedContentText / contentText only.
            if let text = item.attributedContentText?.string ?? item.attributedTitle?.string,
               let url = firstHTTPSURL(in: text)
            {
                return url
            }
        }
        return nil
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
            _ = provider.loadObject(ofClass: URL.self) { object, _ in
                continuation.resume(returning: object as? URL)
            }
        }
    }

    private func loadURL(from provider: NSItemProvider, type: String) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                if let url = item as? URL {
                    continuation.resume(returning: url)
                } else if let string = item as? String, let url = URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines)) {
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

    /// Opens the host via the modern UIApplication API on the responder chain.
    /// Deprecated `openURL:` no-ops on iOS 18+; this 3-arg selector is what Chrome/Readest use.
    private func openHostApp(_ url: URL) async -> Bool {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async {
                let selector = NSSelectorFromString("openURL:options:completionHandler:")
                var responder: UIResponder? = self
                while let current = responder {
                    if let application = current as? UIApplication {
                        application.open(url, options: [:]) { success in
                            continuation.resume(returning: success)
                        }
                        return
                    }
                    if current.responds(to: selector) {
                        typealias OpenURLFn = @convention(c) (
                            AnyObject,
                            Selector,
                            URL,
                            NSDictionary,
                            (@convention(block) (Bool) -> Void)?
                        ) -> Void
                        let imp = current.method(for: selector)
                        let open = unsafeBitCast(imp, to: OpenURLFn.self)
                        open(current, selector, url, [:]) { success in
                            continuation.resume(returning: success)
                        }
                        return
                    }
                    responder = current.next
                }
                continuation.resume(returning: false)
            }
        }
    }
}
