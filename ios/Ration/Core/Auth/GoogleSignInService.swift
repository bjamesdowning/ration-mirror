import GoogleSignIn
import UIKit

enum GoogleSignInService {
    @MainActor
    static func signIn() async throws -> (idToken: String, accessToken: String?) {
        guard let clientID = AppConfig.googleIOSClientID else {
            throw APIError.server(
                status: 400,
                message: "Google Sign-In is not configured. Set GIDClientID in Info.plist.",
                code: "google_not_configured"
            )
        }

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)

        guard let presenter = PresentationAnchorProvider.rootViewController() else {
            throw APIError.transport("No presentation anchor for Google Sign-In.")
        }

        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        guard let idToken = result.user.idToken?.tokenString else {
            throw APIError.server(
                status: 401,
                message: "Google did not return an ID token.",
                code: "google_sign_in_failed"
            )
        }
        return (idToken, result.user.accessToken.tokenString)
    }
}
