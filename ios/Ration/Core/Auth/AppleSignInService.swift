import AuthenticationServices
import CryptoKit
import Security
import UIKit

enum AppleSignInNonce {
    /// RFC 7636-style random nonce for Sign in with Apple (base64url charset).
    ///
    /// Entropy is drawn from `SecRandomCopyBytes` (matching `PKCE.makeVerifier`)
    /// rather than `UInt8.random`, with a fallback only if the CSPRNG is
    /// unavailable. Bytes are rejection-sampled into the charset so the output
    /// is exactly `length` characters.
    static func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        result.reserveCapacity(length)
        while result.count < length {
            var randoms = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            if status != errSecSuccess {
                for i in randoms.indices { randoms[i] = UInt8.random(in: .min ... .max) }
            }
            for random in randoms where result.count < length {
                if random < charset.count {
                    result.append(charset[Int(random)])
                }
            }
        }
        return result
    }

    /// SHA-256 hex digest — Apple expects the hashed nonce on the request.
    static func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashed = SHA256.hash(data: inputData)
        return hashed.map { String(format: "%02x", $0) }.joined()
    }
}

struct AppleSignInResult {
    let identityToken: String
    let rawNonce: String
    let givenName: String?
    let familyName: String?
}

@MainActor
final class AppleSignInCoordinator: NSObject {
    private var continuation: CheckedContinuation<AppleSignInResult, Error>?
    private var rawNonce = ""

    func signIn() async throws -> AppleSignInResult {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            rawNonce = AppleSignInNonce.randomNonceString()
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = AppleSignInNonce.sha256(rawNonce)

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    private func finish(_ result: Result<AppleSignInResult, Error>) {
        continuation?.resume(with: result)
        continuation = nil
    }
}

extension AppleSignInCoordinator: ASAuthorizationControllerDelegate {
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            finish(.failure(APIError.server(status: 401, message: "Apple sign-in failed.", code: "apple_sign_in_failed")))
            return
        }

        let givenName = credential.fullName?.givenName
        let familyName = credential.fullName?.familyName
        finish(.success(AppleSignInResult(
            identityToken: identityToken,
            rawNonce: rawNonce,
            givenName: givenName,
            familyName: familyName
        )))
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        let nsError = error as NSError
        if nsError.domain == ASAuthorizationError.errorDomain,
           nsError.code == ASAuthorizationError.canceled.rawValue {
            finish(.failure(APIError.server(status: 400, message: "Sign-in cancelled.", code: "cancelled")))
            return
        }
        finish(.failure(APIError.transport(error.localizedDescription)))
    }
}

extension AppleSignInCoordinator: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        PresentationAnchorProvider.keyWindow() ?? ASPresentationAnchor()
    }
}
