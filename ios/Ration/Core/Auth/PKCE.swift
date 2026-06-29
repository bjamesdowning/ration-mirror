import CryptoKit
import Foundation
import Security

/// PKCE (RFC 7636) helpers for the magic-link → authorization-code exchange.
///
/// The app generates a high-entropy `verifier`, sends only the S256 `challenge`
/// when requesting the magic link, and proves possession of the verifier at
/// token exchange. This binds the one-time code to this app so a malicious app
/// that hijacks the `ration://` URL scheme cannot redeem an intercepted code.
enum PKCE {
    /// 32 random bytes → 43-char base64url string (within RFC 7636's 43–128).
    static func makeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        if status != errSecSuccess {
            for i in bytes.indices { bytes[i] = UInt8.random(in: .min ... .max) }
        }
        return base64URLEncode(Data(bytes))
    }

    /// S256 challenge: base64url(SHA-256(verifier)).
    static func challenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return base64URLEncode(Data(digest))
    }

    static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
