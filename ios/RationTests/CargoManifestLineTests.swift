import XCTest
@testable import Ration

@MainActor
final class CargoManifestLineTests: XCTestCase {
    private let lineId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    private let operationKey = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

    override func setUp() {
        super.setUp()
        CargoManifestURLProtocol.reset()
    }

    func testCookSendsOnePostThenDiaryLogNotAddToFuel() async throws {
        CargoManifestURLProtocol.mode = .cookThenDiary
        let api = makeAPI()
        _ = try await api.cookCargoLine(id: lineId)
        _ = try await api.logDiaryFood(
            CargoManifestFuelLog.body(
                name: "Carrot",
                quantity: 15,
                unit: "g",
                notes: "leftover",
                nutrition: nil,
                editedEnergy: 6,
                operationKey: operationKey,
                occurredAt: "2026-11-12T13:00:00Z"
            )
        )

        let calls = CargoManifestURLProtocol.calls
        XCTAssertEqual(
            calls.map(\.mobilePath),
            CargoManifestRoutes.cookThenLogPaths(lineId: lineId)
        )
        XCTAssertEqual(calls.map(\.method), ["POST", "POST"])
        XCTAssertEqual(calls.filter { $0.mobilePath.hasSuffix("/cook") }.count, 1)
        XCTAssertFalse(calls.contains { $0.mobilePath.contains("add-to-fuel") })
        XCTAssertEqual(calls[1].mobilePath, CargoManifestRoutes.diaryPath)
    }

    func testCookConflictIsVisible() async {
        CargoManifestURLProtocol.mode = .conflict
        let api = makeAPI()
        do {
            _ = try await api.cookCargoLine(id: lineId)
            XCTFail("Expected the 409 to throw")
        } catch {
            let visible = CargoManifestLineFailure.message(for: error)
            XCTAssertEqual(visible, "Cargo item is not available to cook")
            XCTAssertEqual((error as? APIError)?.statusCode, 409)
            XCTAssertFalse(visible.isEmpty)
        }
    }

    func testPatchAndDeleteHitTheExistingRoutes() async throws {
        CargoManifestURLProtocol.mode = .mutate
        let api = makeAPI()
        _ = try await api.updateCargoLine(
            id: lineId,
            date: "2026-11-13",
            slotType: "lunch",
            quantity: 15
        )
        let deleted = try await api.deleteCargoLine(id: lineId)

        XCTAssertTrue(deleted.deleted)
        let calls = CargoManifestURLProtocol.calls
        XCTAssertEqual(calls.map(\.method), ["PATCH", "DELETE"])
        XCTAssertEqual(
            calls.map(\.mobilePath),
            [CargoManifestRoutes.linePath(lineId), CargoManifestRoutes.linePath(lineId)]
        )
        XCTAssertEqual(CargoManifestURLProtocol.patches.count, 1)
        XCTAssertEqual(CargoManifestURLProtocol.patches[0].date, "2026-11-13")
        XCTAssertEqual(CargoManifestURLProtocol.patches[0].slotType, "lunch")
        XCTAssertEqual(CargoManifestURLProtocol.patches[0].quantity, 15)
        XCTAssertFalse(calls.contains { $0.mobilePath.contains("add-to-fuel") })
        XCTAssertFalse(calls.contains { $0.mobilePath.contains("/cook") })
        XCTAssertFalse(calls.contains { $0.mobilePath.contains("nutrition/diary") })
        XCTAssertFalse(calls.contains { $0.mobilePath.contains("undo") })
    }

    func testCargoOnlySlotDoesNotRenderEmptyMealButton() {
        XCTAssertFalse(CargoManifestSlot.showsEmptyMealButton(mealCount: 0, cargoLineCount: 1))
        XCTAssertFalse(CargoManifestSlot.showsEmptyMealButton(mealCount: 0, cargoLineCount: 3))
        XCTAssertTrue(CargoManifestSlot.showsEmptyMealButton(mealCount: 0, cargoLineCount: 0))
        XCTAssertFalse(CargoManifestSlot.showsEmptyMealButton(mealCount: 1, cargoLineCount: 0))
        XCTAssertFalse(CargoManifestSlot.showsEmptyMealButton(mealCount: 1, cargoLineCount: 1))
        XCTAssertEqual(CargoManifestSlot.controlPoints, 44)
    }

    private func makeAPI() -> RationAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CargoManifestURLProtocol.self]
        let session = URLSession(configuration: config)
        let auth = AuthManager(urlSession: session)
        auth.adopt(TokenPair(accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 3600))
        return RationAPI(client: APIClient(auth: auth, session: session))
    }
}

private struct CargoManifestCall: Equatable {
    let method: String
    let path: String

    var mobilePath: String {
        let marker = "/api/mobile/v1/"
        guard let range = path.range(of: marker) else { return path }
        return String(path[range.upperBound...])
    }
}

private struct CargoLinePatchBody: Decodable {
    let date: String
    let slotType: String
    let quantity: Double
}

private final class CargoManifestURLProtocol: URLProtocol {
    enum Mode {
        case cookThenDiary
        case conflict
        case mutate
    }

    static var mode: Mode = .cookThenDiary
    static var calls: [CargoManifestCall] = []
    static var patches: [CargoLinePatchBody] = []

    static func reset() {
        mode = .cookThenDiary
        calls = []
        patches = []
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        let method = request.httpMethod ?? ""
        Self.calls.append(CargoManifestCall(method: method, path: path))
        let mobile = CargoManifestCall(method: method, path: path).mobilePath

        if mobile.hasSuffix("/cook") {
            if Self.mode == .conflict {
                respond(status: 409, body: #"{"error":"Cargo item is not available to cook"}#")
            } else {
                respond(status: 200, body: Self.cookedLine)
            }
            return
        }

        if mobile == CargoManifestRoutes.diaryPath {
            respond(
                status: 200,
                body: #"{"intakeId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}#"
            )
            return
        }

        if mobile == CargoManifestRoutes.linePath("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
            if method == "PATCH" {
                let body = Self.bodyData(from: request) ?? Data()
                if let patch = try? JSON.decoder.decode(CargoLinePatchBody.self, from: body) {
                    Self.patches.append(patch)
                }
                respond(status: 200, body: Self.cookedLine.replacingOccurrences(of: "\"alreadyCooked\":false,", with: ""))
            } else if method == "DELETE" {
                respond(status: 200, body: #"{"deleted":true}#")
            } else {
                respond(status: 500, body: #"{"error":"unexpected method"}#")
            }
            return
        }

        respond(status: 500, body: #"{"error":"unexpected \#(mobile)"}#")
    }

    override func stopLoading() {}

    private static let cookedLine = """
    {"alreadyCooked":false,"line":{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","cargoId":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","cargoName":"Carrot","date":"2026-11-12","slotType":"breakfast","quantity":15,"unit":"g","notes":null,"cookedAt":"2026-11-12T13:00:00Z"}}
    """

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
