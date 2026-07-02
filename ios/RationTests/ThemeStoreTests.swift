import XCTest
@testable import Ration

final class ThemeStoreTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "ThemeStoreTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    @MainActor
    func testApplyUpdatesColorSchemeImmediately() {
        let store = ThemeStore(defaults: defaults)
        XCTAssertEqual(store.theme, .dark)
        XCTAssertEqual(store.colorScheme, .dark)

        store.apply(.light)
        XCTAssertEqual(store.theme, .light)
        XCTAssertEqual(store.colorScheme, .light)
        XCTAssertEqual(defaults.string(forKey: ThemeStore.userDefaultsKey), "light")
    }

    @MainActor
    func testInitLoadsCachedThemeFromUserDefaults() {
        defaults.set("light", forKey: ThemeStore.userDefaultsKey)
        let store = ThemeStore(defaults: defaults)
        XCTAssertEqual(store.theme, .light)
    }

    @MainActor
    func testSyncFromServerPrefersServerValueOverCache() {
        defaults.set("light", forKey: ThemeStore.userDefaultsKey)
        let store = ThemeStore(defaults: defaults)
        XCTAssertEqual(store.theme, .light)

        store.syncFromServer(UserSettings(theme: "dark"))
        XCTAssertEqual(store.theme, .dark)
        XCTAssertEqual(defaults.string(forKey: ThemeStore.userDefaultsKey), "dark")
    }

    @MainActor
    func testSyncFromServerDefaultsToDarkWhenUnset() {
        defaults.set("light", forKey: ThemeStore.userDefaultsKey)
        let store = ThemeStore(defaults: defaults)

        store.syncFromServer(UserSettings(theme: nil))
        XCTAssertEqual(store.theme, .dark)
    }

    @MainActor
    func testClearResetsToDarkAndRemovesUserDefaults() {
        let store = ThemeStore(defaults: defaults)
        store.apply(.light)
        XCTAssertEqual(defaults.string(forKey: ThemeStore.userDefaultsKey), "light")

        store.clear()
        XCTAssertEqual(store.theme, .dark)
        XCTAssertNil(defaults.string(forKey: ThemeStore.userDefaultsKey))
    }
}
