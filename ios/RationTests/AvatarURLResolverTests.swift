import XCTest
@testable import Ration

final class AvatarURLResolverTests: XCTestCase {
    func testResolvesRelativeUserAvatarPath() {
        let url = AvatarURLResolver.resolve("/api/user/avatar/user_abc?v=123")
        XCTAssertNotNil(url)
        XCTAssertEqual(url?.path, "/api/user/avatar/user_abc")
        XCTAssertEqual(url?.query, "v=123")
        XCTAssertEqual(url?.scheme, "https")
        XCTAssertEqual(url?.host, "ration.mayutic.com")
    }

    func testResolvesRelativeOrgAvatarPath() {
        let url = AvatarURLResolver.resolve("/api/organization/avatar/org_xyz")
        XCTAssertNotNil(url)
        XCTAssertTrue(AvatarURLResolver.requiresAuthentication(url!))
    }

    func testResolvesGoogleOAuthURL() {
        let raw = "https://lh3.googleusercontent.com/a/abc123"
        let url = AvatarURLResolver.resolve(raw)
        XCTAssertEqual(url?.absoluteString, raw)
        XCTAssertFalse(AvatarURLResolver.requiresAuthentication(url!))
    }

    func testRejectsJavascriptScheme() {
        XCTAssertNil(AvatarURLResolver.resolve("javascript:alert(1)"))
    }

    func testRejectsNonApiRelativePath() {
        XCTAssertNil(AvatarURLResolver.resolve("/evil/redirect"))
    }

    func testRejectsEmptyAndWhitespace() {
        XCTAssertNil(AvatarURLResolver.resolve(nil))
        XCTAssertNil(AvatarURLResolver.resolve(""))
        XCTAssertNil(AvatarURLResolver.resolve("   "))
    }
}

final class NextActionDismissStoreTests: XCTestCase {
    @MainActor
    func testDismissIncrementsRevisionAndPersists() {
        let defaults = UserDefaults(suiteName: "NextActionDismissStoreTests")!
        defaults.removePersistentDomain(forName: "NextActionDismissStoreTests")
        let store = NextActionDismissStore(defaults: defaults)

        XCTAssertFalse(store.isDismissed(actionKey: "scan", organizationId: "org_1"))
        let before = store.revision
        store.dismiss(actionKey: "scan", organizationId: "org_1")
        XCTAssertGreaterThan(store.revision, before)
        XCTAssertTrue(store.isDismissed(actionKey: "scan", organizationId: "org_1"))
        XCTAssertFalse(store.isDismissed(actionKey: "scan", organizationId: "org_2"))
    }
}
