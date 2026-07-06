import AuthenticationServices
import CryptoKit
import UIKit

enum AppleSignInNonce {
    /// RFC 7636-style random nonce for Sign in with Apple (base64url).
    static func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        result.reserveCapacity(length)
        var remaining = length
        while remaining > 0 {
            let randoms = (0..<16).map { _ in UInt8.random(in: 0...255) }
            for random in randoms where remaining > 0 {
                if random < charset.count {
                    result.append(charset[Int(random)])
                    remaining -= 1
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
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) {
            return window
        }
        if let window = scenes.flatMap(\.windows).first {
            return window
        }
        return ASPresentationAnchor()
    }
}
