import XCTest
@testable import Ration

@MainActor
final class AddToFuelClientContractTests: XCTestCase {
    private let intakeId = "22222222-2222-4222-8222-222222222222"
    private let mealId = "33333333-3333-4333-8333-333333333333"
    private let operationKey = "11111111-1111-4111-8111-111111111111"

    override func setUp() {
        super.setUp()
        AddToFuelURLProtocol.reset()
    }

    func testCargoSuccessDecodesIntakeIdAndDeductedWithoutCargoId() throws {
        let body = Data(
            """
            {"intakeId":"\(intakeId)","deducted":2}
            """.utf8
        )
        let saved = try JSON.decoder.decode(CargoFuelResponse.self, from: body)
        XCTAssertEqual(saved.intakeId, intakeId)
        XCTAssertEqual(saved.deducted, 2)

        let withCargoId = Data(
            """
            {"intakeId":"\(intakeId)","deducted":1.5,"cargoId":"not-required"}
            """.utf8
        )
        let tolerated = try JSON.decoder.decode(CargoFuelResponse.self, from: withCargoId)
        XCTAssertEqual(tolerated.intakeId, intakeId)
        XCTAssertEqual(tolerated.deducted, 1.5)

        let withoutDeducted = Data(
            """
            {"intakeId":"\(intakeId)"}
            """.utf8
        )
        let intakeOnly = try JSON.decoder.decode(CargoFuelResponse.self, from: withoutDeducted)
        XCTAssertEqual(intakeOnly.intakeId, intakeId)
        XCTAssertNil(intakeOnly.deducted)

        XCTAssertThrowsError(
            try JSON.decoder.decode(CargoFuelResponse.self, from: Data(#"{"cargoId":"only-cargo"}"#.utf8))
        )
        XCTAssertThrowsError(
            try JSON.decoder.decode(CargoFuelResponse.self, from: Data(#"{"intakeId":"","deducted":1}"#.utf8))
        )
    }

    func testMealConfirmationBodyIsNotASavedLog() throws {
        let confirmation = Data(
            """
            {"requiresConfirmation":true,"missingIngredients":[{"name":"oats","required":1,"available":0,"unit":"cup"}],"intakeId":"\(intakeId)","mealId":"\(mealId)"}
            """.utf8
        )
        let asked = try JSON.decoder.decode(MealFuelResult.self, from: confirmation)
        guard case .needsConfirmation(let missing) = asked else {
            return XCTFail("Expected a confirmation, got a saved log")
        }
        XCTAssertEqual(missing.map(\.name), ["oats"])
        XCTAssertEqual(missing.first?.required, 1)
        XCTAssertEqual(missing.first?.available, 0)
        XCTAssertEqual(missing.first?.unit, "cup")

        let savedBody = Data(
            """
            {"intakeId":"\(intakeId)","mealId":"\(mealId)","requiresConfirmation":false}
            """.utf8
        )
        let saved = try JSON.decoder.decode(MealFuelResult.self, from: savedBody)
        guard case .saved(let decodedIntake, let decodedMeal, let undoToken) = saved else {
            return XCTFail("Expected a saved log")
        }
        XCTAssertEqual(decodedIntake, intakeId)
        XCTAssertEqual(decodedMeal, mealId)
        XCTAssertNil(undoToken)

        XCTAssertThrowsError(
            try JSON.decoder.decode(
                MealFuelResult.self,
                from: Data(#"{"intakeId":"\#(intakeId)","mealId":"\#(mealId)"}"#.utf8)
            )
        )
        XCTAssertThrowsError(
            try JSON.decoder.decode(
                MealFuelResult.self,
                from: Data(#"{"requiresConfirmation":false}"#.utf8)
            )
        )
        XCTAssertThrowsError(
            try JSON.decoder.decode(
                MealFuelResult.self,
                from: Data(#"{"requiresConfirmation":true}"#.utf8)
            )
        )
    }

    func testSecondSubmitOfTheSamePresentationReusesTheKey() {
        var presentation = FuelAddPresentation(operationKey: operationKey)
        let first = presentation.submit()
        let second = presentation.submit()
        XCTAssertEqual(first.operationKey, operationKey)
        XCTAssertEqual(second.operationKey, first.operationKey)
        XCTAssertFalse(first.confirmInsufficient)
        XCTAssertFalse(second.confirmInsufficient)

        presentation.confirmShortPantry()
        let confirmed = presentation.submit()
        XCTAssertEqual(confirmed.operationKey, first.operationKey)
        XCTAssertTrue(confirmed.confirmInsufficient)

        presentation.declineShortPantry()
        let declined = presentation.submit()
        XCTAssertEqual(declined.operationKey, first.operationKey)
        XCTAssertFalse(declined.confirmInsufficient)

        presentation.begin(operationKey: "44444444-4444-4444-8444-444444444444")
        let nextPresentation = presentation.submit()
        XCTAssertEqual(nextPresentation.operationKey, "44444444-4444-4444-8444-444444444444")
        XCTAssertNotEqual(nextPresentation.operationKey, first.operationKey)
        XCTAssertFalse(nextPresentation.confirmInsufficient)
    }

    func testFuelTimeZoneRequiredRetriesOnce() async throws {
        let zone = try XCTUnwrap(FuelDeviceZone.candidate)
        AddToFuelURLProtocol.mode = .cargoThenSuccess
        let api = makeAPI()

        let saved = try await api.addCargoToFuel(
            id: "cargo-1",
            quantity: 2,
            operationKey: operationKey
        )
        XCTAssertEqual(saved.intakeId, intakeId)
        XCTAssertEqual(saved.deducted, 2)

        let posts = AddToFuelURLProtocol.fuelPosts
        XCTAssertEqual(posts.count, 2)
        XCTAssertEqual(posts.map(\.operationKey), [operationKey, operationKey])
        XCTAssertEqual(posts.map(\.idempotencyKey), [operationKey, operationKey])
        XCTAssertEqual(posts.map(\.fuelTimeZone), [zone, zone])
        XCTAssertEqual(posts[0].occurredAt, posts[1].occurredAt)
        XCTAssertEqual(AddToFuelURLProtocol.settingsPatches.count, 1)
        XCTAssertEqual(AddToFuelURLProtocol.settingsPatches[0].fuelTimeZone, zone)
    }

    func testFuelTimeZoneRequiredDoesNotRetryPastTheSecondPost() async {
        AddToFuelURLProtocol.mode = .cargoTimezonePersists
        let api = makeAPI()
        do {
            _ = try await api.addCargoToFuel(
                id: "cargo-1",
                quantity: 2,
                operationKey: operationKey
            )
            XCTFail("Expected fuel_timezone_required")
        } catch let error as APIError {
            XCTAssertEqual(error.code, "fuel_timezone_required")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
        XCTAssertEqual(AddToFuelURLProtocol.fuelPosts.count, 2)
        XCTAssertEqual(AddToFuelURLProtocol.settingsPatches.count, 1)
        XCTAssertEqual(
            AddToFuelURLProtocol.fuelPosts.map(\.operationKey),
            [operationKey, operationKey]
        )
    }

    func testMealZoneRetryDecodesConfirmationWithoutConfirming() async throws {
        let zone = try XCTUnwrap(FuelDeviceZone.candidate)
        AddToFuelURLProtocol.mode = .mealThenConfirmation
        let api = makeAPI()
        let result = try await api.addMealToFuel(
            id: mealId,
            servings: 1,
            operationKey: operationKey,
            confirmInsufficient: false
        )
        guard case .needsConfirmation(let missing) = result else {
            return XCTFail("Confirmation was treated as a saved log")
        }
        XCTAssertEqual(missing.map(\.name), ["oats"])
        let posts = AddToFuelURLProtocol.fuelPosts
        XCTAssertEqual(posts.count, 2)
        XCTAssertEqual(posts.map(\.operationKey), [operationKey, operationKey])
        XCTAssertEqual(posts.map(\.confirmInsufficient), [false, false])
        XCTAssertEqual(posts.map(\.fuelTimeZone), [zone, zone])
        XCTAssertEqual(AddToFuelURLProtocol.settingsPatches.count, 1)
    }

    func testNotesAndEditedCaloriePreviewAreSent() async throws {
        AddToFuelURLProtocol.mode = .cargoThenSuccess
        let api = makeAPI()
        let saved = try await api.addCargoToFuel(
            id: "cargo-1",
            quantity: 1.25,
            operationKey: operationKey,
            notes: "leftover",
            energyKcal: 46
        )
        XCTAssertEqual(saved.intakeId, intakeId)
        let posts = AddToFuelURLProtocol.fuelPosts
        XCTAssertEqual(posts.count, 2)
        XCTAssertEqual(posts.map(\.operationKey), [operationKey, operationKey])
        XCTAssertEqual(posts.map(\.quantity), [1.25, 1.25])
        XCTAssertEqual(posts.map(\.notes), ["leftover", "leftover"])
        XCTAssertEqual(posts.map(\.energyKcal), [46, 46])

        AddToFuelURLProtocol.reset()
        AddToFuelURLProtocol.mode = .mealThenConfirmation
        let meal = try await api.addMealToFuel(
            id: mealId,
            servings: 1.25,
            operationKey: operationKey,
            confirmInsufficient: false,
            notes: "leftover",
            energyKcal: 46
        )
        guard case .needsConfirmation = meal else {
            return XCTFail("Confirmation was treated as a saved log")
        }
        let mealPosts = AddToFuelURLProtocol.fuelPosts
        XCTAssertEqual(mealPosts.count, 2)
        XCTAssertEqual(mealPosts.map(\.operationKey), [operationKey, operationKey])
        XCTAssertEqual(mealPosts.map(\.servings), [1.25, 1.25])
        XCTAssertEqual(mealPosts.map(\.notes), ["leftover", "leftover"])
        XCTAssertEqual(mealPosts.map(\.energyKcal), [46, 46])
        XCTAssertEqual(mealPosts.map(\.confirmInsufficient), [false, false])
    }

    private func makeAPI() -> RationAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AddToFuelURLProtocol.self]
        let session = URLSession(configuration: config)
        let auth = AuthManager(urlSession: session)
        auth.adopt(TokenPair(accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 3600))
        return RationAPI(client: APIClient(auth: auth, session: session))
    }
}

private struct PostedFuelBody: Decodable {
    let quantity: Double?
    let servings: Double?
    let operationKey: String
    let idempotencyKey: String
    let occurredAt: String
    let fuelTimeZone: String?
    let confirmInsufficient: Bool?
    let notes: String?
    let energyKcal: Double?
}

private struct PostedZonePatch: Decodable {
    let fuelTimeZone: String?
}

private final class AddToFuelURLProtocol: URLProtocol {
    enum Mode {
        case cargoThenSuccess
        case cargoTimezonePersists
        case mealThenConfirmation
    }

    static var mode: Mode = .cargoThenSuccess
    static var fuelPosts: [PostedFuelBody] = []
    static var settingsPatches: [PostedZonePatch] = []

    private static let zoneError = #"{"error":"Set a time zone on Fuel before logging","code":"fuel_timezone_required"}"#
    private static let intakeId = "22222222-2222-4222-8222-222222222222"
    private static let mealId = "33333333-3333-4333-8333-333333333333"

    static func reset() {
        mode = .cargoThenSuccess
        fuelPosts = []
        settingsPatches = []
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        let method = request.httpMethod ?? ""
        let body = Self.bodyData(from: request) ?? Data()

        if method == "PATCH", path.hasSuffix("/settings") {
            if let patch = try? JSON.decoder.decode(PostedZonePatch.self, from: body) {
                Self.settingsPatches.append(patch)
            } else {
                Self.settingsPatches.append(PostedZonePatch(fuelTimeZone: nil))
            }
            respond(status: 200, body: #"{"settings":{}}"#)
            return
        }

        if path.hasSuffix("/add-to-fuel") {
            if let posted = try? JSON.decoder.decode(PostedFuelBody.self, from: body) {
                Self.fuelPosts.append(posted)
            }
            switch Self.mode {
            case .cargoThenSuccess:
                if Self.fuelPosts.count == 1 {
                    respond(status: 400, body: Self.zoneError)
                } else {
                    respond(
                        status: 200,
                        body: #"{"intakeId":"\#(Self.intakeId)","deducted":2}"#
                    )
                }
            case .cargoTimezonePersists:
                respond(status: 400, body: Self.zoneError)
            case .mealThenConfirmation:
                if Self.fuelPosts.count == 1 {
                    respond(status: 400, body: Self.zoneError)
                } else {
                    respond(
                        status: 200,
                        body: #"{"requiresConfirmation":true,"missingIngredients":[{"name":"oats","required":1,"available":0,"unit":"cup"}]}"#
                    )
                }
            }
            return
        }

        respond(status: 500, body: #"{"error":"unexpected","code":"unexpected"}"#)
    }

    override func stopLoading() {}

    private static func bodyData(from request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1024)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let count = stream.read(buffer, maxLength: 1024)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }

    private func respond(status: Int, body: String) {
        guard let url = request.url,
              let data = body.data(using: .utf8),
              let response = HTTPURLResponse(
                url: url,
                statusCode: status,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
              )
        else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
