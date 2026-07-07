import XCTest
@testable import Ration

final class AuthFlowModeTests: XCTestCase {
    func testSignInDoesNotRequireTosConsent() {
        XCTAssertFalse(AuthFlowMode.signIn.requiresTosConsent)
        XCTAssertTrue(AuthFlowMode.canProceed(tosAccepted: false, mode: .signIn))
    }

    func testSignUpRequiresTosConsent() {
        XCTAssertTrue(AuthFlowMode.signUp.requiresTosConsent)
        XCTAssertFalse(AuthFlowMode.canProceed(tosAccepted: false, mode: .signUp))
        XCTAssertTrue(AuthFlowMode.canProceed(tosAccepted: true, mode: .signUp))
    }

    func testMagicLinkSubmitGating() {
        XCTAssertTrue(
            AuthFlowMode.canSubmitMagicLink(
                emailValid: true,
                tosAccepted: false,
                mode: .signIn
            )
        )
        XCTAssertFalse(
            AuthFlowMode.canSubmitMagicLink(
                emailValid: true,
                tosAccepted: false,
                mode: .signUp
            )
        )
        XCTAssertFalse(
            AuthFlowMode.canSubmitMagicLink(
                emailValid: false,
                tosAccepted: true,
                mode: .signIn
            )
        )
        XCTAssertTrue(
            AuthFlowMode.canSubmitMagicLink(
                emailValid: true,
                tosAccepted: true,
                mode: .signUp
            )
        )
    }
}
