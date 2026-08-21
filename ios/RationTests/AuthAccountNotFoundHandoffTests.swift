import XCTest
@testable import Ration

final class AuthAccountNotFoundHandoffTests: XCTestCase {
    override func setUp() {
        super.setUp()
        AuthAccountNotFoundStore.clear()
        AuthAppleFullNameStore.clear()
        Keychain.delete("refresh_token")
    }

    override func tearDown() {
        AuthAccountNotFoundStore.clear()
        AuthAppleFullNameStore.clear()
        super.tearDown()
    }

    @MainActor
    func testRecordSurvivesNewAuthManager() {
        let first = AuthManager()
        first.recordAccountNotFound("No account found. Create an account instead.")

        XCTAssertEqual(first.phase, .signedOut)
        XCTAssertEqual(
            first.pendingAuthNotice,
            .accountNotFound("No account found. Create an account instead.")
        )

        let recreated = AuthManager()
        XCTAssertEqual(recreated.phase, .signedOut)
        XCTAssertEqual(
            recreated.pendingAuthNotice,
            .accountNotFound("No account found. Create an account instead.")
        )
        XCTAssertEqual(
            recreated.authErrorMessage,
            "No account found. Create an account instead."
        )

        let consumed = recreated.consumePendingAuthNotice()
        XCTAssertEqual(
            consumed,
            .accountNotFound("No account found. Create an account instead.")
        )
        XCTAssertNil(AuthManager().pendingAuthNotice)
    }

    @MainActor
    func testEmptyMessageUsesDefaultCopy() {
        let auth = AuthManager()
        auth.recordAccountNotFound("   ")
        XCTAssertEqual(
            auth.pendingAuthNotice,
            .accountNotFound(APIError.accountNotFoundDefaultMessage)
        )
    }

    @MainActor
    func testBootstrapWithoutTokenStaysSignedOut() async {
        AuthAccountNotFoundStore.clear()
        Keychain.delete("refresh_token")
        let auth = AuthManager()
        XCTAssertEqual(auth.phase, .signedOut)
        await auth.bootstrap()
        XCTAssertEqual(auth.phase, .signedOut)
    }
}
