import Foundation
import XCTest
@testable import Ration

final class BaseLayerTests: XCTestCase {
    func testJSONDecoderAcceptsFractionalISO8601Dates() throws {
        let data = """
        {
          "id": "cargo_1",
          "organizationId": "org_1",
          "name": "rice",
          "quantity": 2,
          "unit": "kg",
          "tags": ["dry"],
          "domain": "food",
          "status": "stable",
          "expiresAt": null,
          "createdAt": "2026-06-29T12:00:00.123Z",
          "updatedAt": "2026-06-29T12:01:00.000Z"
        }
        """.data(using: .utf8)!

        let item = try JSON.decoder.decode(CargoItem.self, from: data)

        XCTAssertEqual(item.id, "cargo_1")
        XCTAssertEqual(item.name, "rice")
        XCTAssertEqual(item.quantity, 2)
    }

    func testCargoItemDecodesTagsWhenServerReturnsJSONString() throws {
        // Regression: legacy double-encoded `tags` rows read back as a JSON string
        // instead of an array. The list must still decode instead of hard-failing.
        let data = """
        {
          "id": "cargo_1",
          "organizationId": "org_1",
          "name": "rice",
          "quantity": 2,
          "unit": "kg",
          "tags": "[\\"dry\\",\\"pantry\\"]",
          "domain": "food",
          "status": "stable",
          "expiresAt": null,
          "createdAt": "2026-06-29T12:00:00.123Z",
          "updatedAt": "2026-06-29T12:01:00.000Z"
        }
        """.data(using: .utf8)!

        let item = try JSON.decoder.decode(CargoItem.self, from: data)

        XCTAssertEqual(item.tags, ["dry", "pantry"])
    }

    func testCargoItemDecodesEmptyTagsString() throws {
        let data = """
        {
          "id": "cargo_2",
          "organizationId": "org_1",
          "name": "salt",
          "quantity": 1,
          "unit": "kg",
          "tags": "[]",
          "domain": "food",
          "status": "stable",
          "expiresAt": null,
          "createdAt": "2026-06-29T12:00:00.123Z",
          "updatedAt": "2026-06-29T12:01:00.000Z"
        }
        """.data(using: .utf8)!

        let item = try JSON.decoder.decode(CargoItem.self, from: data)

        XCTAssertEqual(item.tags, [])
    }

    func testAPIErrorCodeExposesServerCodeOnly() {
        let error = APIError.server(
            status: 409,
            message: "Active App Store subscription",
            code: "active_app_store_subscription"
        )

        XCTAssertEqual(error.code, "active_app_store_subscription")
        XCTAssertEqual(error.errorDescription, "Active App Store subscription")
    }

    func testAPIErrorStatusCodeExposesServerStatusOnly() {
        let error = APIError.server(
            status: 429,
            message: "Too many requests",
            code: nil
        )

        XCTAssertEqual(error.statusCode, 429)
        XCTAssertNil(APIError.transport("offline").statusCode)
    }

    func testPKCEChallengeMatchesRFC7636Vector() {
        // RFC 7636 Appendix B reference vector — must match the server's S256 impl.
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        let challenge = PKCE.challenge(for: verifier)

        XCTAssertEqual(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    func testPKCEVerifierIsURLSafeAndCorrectLength() {
        let verifier = PKCE.makeVerifier()

        XCTAssertEqual(verifier.count, 43)
        XCTAssertNil(verifier.rangeOfCharacter(from: CharacterSet(charactersIn: "+/=")))
    }

    private var hasRevenueCatPublicKey: Bool {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "RevenueCatPublicAPIKey") as? String else {
            return false
        }
        return !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    @MainActor
    func testBillingManagerConfigureReflectsPlistKey() {
        let manager = BillingManager()
        manager.configureIfPossible()

        if hasRevenueCatPublicKey {
            XCTAssertEqual(manager.sdkState, .configured)
        } else {
            guard case let .notConfigured(message) = manager.sdkState else {
                XCTFail("Expected missing public RevenueCat key to leave SDK unconfigured")
                return
            }
            XCTAssertTrue(message.contains("RevenueCatPublicAPIKey"))
        }
    }

    @MainActor
    func testBillingManagerBlocksPurchaseWhenRevenueCatIsNotReady() async {
        let manager = BillingManager()
        let expectedCode = hasRevenueCatPublicKey ? "revenuecat_login_required" : "revenuecat_not_configured"

        do {
            _ = try await manager.purchase(packageID: "crew-monthly")
            XCTFail("Expected purchase to fail when RevenueCat is not ready")
        } catch let error as APIError {
            XCTAssertEqual(error.code, expectedCode)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    @MainActor
    func testBillingManagerBlocksRestoreWhenRevenueCatIsNotReady() async {
        let manager = BillingManager()
        let expectedCode = hasRevenueCatPublicKey ? "revenuecat_login_required" : "revenuecat_not_configured"

        do {
            try await manager.restorePurchases()
            XCTFail("Expected restore to fail when RevenueCat is not ready")
        } catch let error as APIError {
            XCTAssertEqual(error.code, expectedCode)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testSettingsResponseDecodesAIConsent() throws {
        let data = """
        { "settings": { "aiConsentAt": "2026-06-29T12:00:00.000Z", "supplyUnitMode": "metric" } }
        """.data(using: .utf8)!

        let response = try JSON.decoder.decode(SettingsResponse.self, from: data)
        XCTAssertEqual(response.settings.aiConsentAt, "2026-06-29T12:00:00.000Z")
    }

    func testCreditPackProductPrefix() {
        XCTAssertTrue("credits_m".hasPrefix(AppConfig.creditPackProductPrefix))
        XCTAssertFalse("crew_monthly".hasPrefix(AppConfig.creditPackProductPrefix))
    }

    func testAuthCodeParsesUniversalLink() {
        let url = URL(string: "https://ration.mayutic.com/auth/mobile-callback/open?code=abc-123")!
        XCTAssertEqual(RationApp.authCode(from: url), "abc-123")
    }

    func testAuthCodeParsesCustomSchemeFallback() {
        let url = URL(string: "ration://auth/callback?code=xyz-789")!
        XCTAssertEqual(RationApp.authCode(from: url), "xyz-789")
    }

    func testAuthCodeRejectsUnrelatedUniversalLinkPath() {
        let url = URL(string: "https://ration.mayutic.com/hub?code=nope")!
        XCTAssertNil(RationApp.authCode(from: url))
    }

    func testAuthCodeRejectsUnknownScheme() {
        let url = URL(string: "evil://auth/callback?code=nope")!
        XCTAssertNil(RationApp.authCode(from: url))
    }
}
