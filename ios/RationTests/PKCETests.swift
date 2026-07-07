import CryptoKit
import Foundation
import XCTest
@testable import Ration

/// Verifies the PKCE (RFC 7636) S256 challenge derivation and that both the
/// verifier and challenge are URL-safe base64url with no `+`, `/`, or `=`.
final class PKCETests: XCTestCase {
    /// challenge == base64url(SHA-256(verifier)), computed independently here.
    func testChallengeIsBase64URLOfSHA256OfVerifier() {
        let verifier = PKCE.makeVerifier()

        let digest = SHA256.hash(data: Data(verifier.utf8))
        let expected = Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")

        XCTAssertEqual(PKCE.challenge(for: verifier), expected)
    }

    func testChallengeContainsNoPlusSlashOrPaddingCharacters() {
        let challenge = PKCE.challenge(for: PKCE.makeVerifier())
        XCTAssertNil(challenge.rangeOfCharacter(from: CharacterSet(charactersIn: "+/=")))
    }

    func testVerifierContainsNoPlusSlashOrPaddingCharacters() {
        let verifier = PKCE.makeVerifier()
        XCTAssertNil(verifier.rangeOfCharacter(from: CharacterSet(charactersIn: "+/=")))
    }

    func testChallengeIsDeterministicForSameVerifier() {
        let verifier = PKCE.makeVerifier()
        XCTAssertEqual(PKCE.challenge(for: verifier), PKCE.challenge(for: verifier))
    }

    func testVerifiersAreUnique() {
        XCTAssertNotEqual(PKCE.makeVerifier(), PKCE.makeVerifier())
    }
}
