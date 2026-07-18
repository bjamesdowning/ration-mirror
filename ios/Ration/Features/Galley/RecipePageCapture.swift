import Foundation
import WebKit

/// Detects publisher bot-wall / access-support pages (mirrors server heuristics).
enum RecipePageBlockDetector {
    private static let patterns: [String] = [
        "access issue",
        "support@people.inc",
        "contentlicensing@people.inc",
        "attention required",
        "just a moment",
        "cf-browser-verification",
        "enable javascript and cookies",
        "checking your browser",
        "sorry, you have been blocked",
        "access denied",
        "robot or automated request",
    ]

    static func isBlockedPageHtml(_ text: String) -> Bool {
        let sample = String(text.prefix(8_000)).lowercased()
        return patterns.contains { sample.contains($0) }
    }
}

enum RecipePageCaptureError: LocalizedError {
    case invalidURL
    case emptyContent
    case blocked
    case timedOut
    case tooLarge
    case webViewFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "That URL is not valid."
        case .emptyContent:
            return "Could not read page content from your device."
        case .blocked:
            return "This site blocked import even from your device (bot protection). Open the recipe in Safari and add it manually in Galley, or try another URL."
        case .timedOut:
            return "Loading the page on your device timed out. Try again or add the meal manually."
        case .tooLarge:
            return "The page HTML is too large to upload. Try copying only the recipe section, or add the meal manually."
        case .webViewFailed(let message):
            return message
        }
    }
}

/// Prefers JSON-LD Recipe blocks and trims to a safe upload size (UTF-8 bytes).
enum RecipePageHtmlTrimmer {
    static let maxBytes = 1_000_000

    static func prepareForUpload(_ html: String) throws -> String {
        if let jsonLd = extractJsonLdRecipe(html) {
            let wrapped = "<script type=\"application/ld+json\">\(jsonLd)</script>\n\(sanitizeLight(html))"
            return try truncateUtf8(wrapped, maxBytes: maxBytes)
        }
        return try truncateUtf8(html, maxBytes: maxBytes)
    }

    private static func extractJsonLdRecipe(_ html: String) -> String? {
        guard let regex = try? NSRegularExpression(
            pattern: #"<script[^>]+type=["']application/ld\+json["'][^>]*>([\s\S]*?)</script>"#,
            options: [.caseInsensitive]
        ) else { return nil }
        let range = NSRange(html.startIndex..<html.endIndex, in: html)
        let matches = regex.matches(in: html, options: [], range: range)
        for match in matches {
            guard match.numberOfRanges >= 2,
                  let bodyRange = Range(match.range(at: 1), in: html)
            else { continue }
            let raw = String(html[bodyRange]).trimmingCharacters(in: .whitespacesAndNewlines)
            guard let data = raw.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data)
            else { continue }
            if jsonContainsRecipe(obj) { return raw }
        }
        return nil
    }

    private static func jsonContainsRecipe(_ value: Any) -> Bool {
        if let dict = value as? [String: Any] {
            if let type = dict["@type"] as? String, type == "Recipe" { return true }
            if let type = dict["@type"] as? [String], type.contains("Recipe") { return true }
            for nested in dict.values where jsonContainsRecipe(nested) { return true }
        } else if let arr = value as? [Any] {
            for nested in arr where jsonContainsRecipe(nested) { return true }
        }
        return false
    }

    private static func sanitizeLight(_ html: String) -> String {
        var s = html
        for pattern in [#"<script[\s\S]*?</script>"#, #"<style[\s\S]*?</style>"#] {
            if let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) {
                s = re.stringByReplacingMatches(
                    in: s,
                    options: [],
                    range: NSRange(s.startIndex..<s.endIndex, in: s),
                    withTemplate: ""
                )
            }
        }
        return String(s.prefix(15_000))
    }

    private static func truncateUtf8(_ text: String, maxBytes: Int) throws -> String {
        guard let data = text.data(using: .utf8) else {
            throw RecipePageCaptureError.emptyContent
        }
        if data.count <= maxBytes { return text }
        // Prefer keeping the start (JSON-LD / recipe often at top).
        let sliced = data.prefix(maxBytes)
        guard let truncated = String(data: sliced, encoding: .utf8)
            ?? String(data: data.prefix(maxBytes - 3), encoding: .utf8)
        else {
            throw RecipePageCaptureError.tooLarge
        }
        return truncated
    }
}

/// Captures recipe page HTML on-device: URLSession first, then WKWebView.
@MainActor
enum RecipePageCapture {
    private static let safariUA =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
    private static let sessionTimeout: TimeInterval = 15
    private static let webViewTimeout: TimeInterval = 25
    private static let minContentLength = 200

    /// Keeps in-flight bridges alive until `finish` (WKNavigationDelegate is weak).
    private static var inFlightBridges: [UUID: WebViewCaptureBridge] = [:]

    static func captureHtml(from urlString: String) async throws -> String {
        guard let url = URL(string: urlString), url.scheme == "https" else {
            throw RecipePageCaptureError.invalidURL
        }

        if let html = try? await fetchWithURLSession(url),
           html.count >= minContentLength,
           !RecipePageBlockDetector.isBlockedPageHtml(html)
        {
            return try RecipePageHtmlTrimmer.prepareForUpload(html)
        }

        let html = try await fetchWithWebView(url)
        guard html.count >= minContentLength else {
            throw RecipePageCaptureError.emptyContent
        }
        if RecipePageBlockDetector.isBlockedPageHtml(html) {
            throw RecipePageCaptureError.blocked
        }
        return try RecipePageHtmlTrimmer.prepareForUpload(html)
    }

    private static func fetchWithURLSession(_ url: URL) async throws -> String {
        var request = URLRequest(url: url, timeoutInterval: sessionTimeout)
        request.setValue(safariUA, forHTTPHeaderField: "User-Agent")
        request.setValue("text/html", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw RecipePageCaptureError.emptyContent
        }
        if [402, 403, 429].contains(http.statusCode) {
            throw RecipePageCaptureError.blocked
        }
        guard (200..<300).contains(http.statusCode) else {
            throw RecipePageCaptureError.emptyContent
        }
        guard let html = String(data: data, encoding: .utf8) else {
            throw RecipePageCaptureError.emptyContent
        }
        if RecipePageBlockDetector.isBlockedPageHtml(html) {
            throw RecipePageCaptureError.blocked
        }
        return html
    }

    private static func fetchWithWebView(_ url: URL) async throws -> String {
        let id = UUID()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let bridge = WebViewCaptureBridge(
                    id: id,
                    url: url,
                    timeout: webViewTimeout,
                    userAgent: safariUA
                ) { result in
                    inFlightBridges[id] = nil
                    continuation.resume(with: result)
                }
                inFlightBridges[id] = bridge
                bridge.start()
            }
        } onCancel: {
            Task { @MainActor in
                inFlightBridges[id]?.cancel(with: CancellationError())
            }
        }
    }
}

@MainActor
private final class WebViewCaptureBridge: NSObject, WKNavigationDelegate {
    private let id: UUID
    private let url: URL
    private let timeout: TimeInterval
    private let userAgent: String
    private let completion: (Result<String, Error>) -> Void
    private var webView: WKWebView?
    private var finished = false
    private var timeoutItem: DispatchWorkItem?

    init(
        id: UUID,
        url: URL,
        timeout: TimeInterval,
        userAgent: String,
        completion: @escaping (Result<String, Error>) -> Void
    ) {
        self.id = id
        self.url = url
        self.timeout = timeout
        self.userAgent = userAgent
        self.completion = completion
    }

    func start() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 568), configuration: config)
        view.customUserAgent = userAgent
        view.navigationDelegate = self
        webView = view

        let work = DispatchWorkItem { [weak self] in
            self?.finish(.failure(RecipePageCaptureError.timedOut))
        }
        timeoutItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: work)

        view.load(URLRequest(url: url))
    }

    func cancel(with error: Error) {
        finish(.failure(error))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            guard let self else { return }
            webView.evaluateJavaScript("document.documentElement.outerHTML") { value, err in
                Task { @MainActor in
                    if let html = value as? String, !html.isEmpty {
                        self.finish(.success(html))
                    } else {
                        self.finish(.failure(
                            RecipePageCaptureError.webViewFailed(
                                err?.localizedDescription ?? "Could not read page HTML."
                            )
                        ))
                    }
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(.failure(RecipePageCaptureError.webViewFailed(error.localizedDescription)))
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        finish(.failure(RecipePageCaptureError.webViewFailed(error.localizedDescription)))
    }

    private func finish(_ result: Result<String, Error>) {
        guard !finished else { return }
        finished = true
        timeoutItem?.cancel()
        timeoutItem = nil
        webView?.navigationDelegate = nil
        webView?.stopLoading()
        webView = nil
        completion(result)
    }
}
