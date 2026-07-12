import XCTest
@testable import Ration

final class DeleteGroupResponseTests: XCTestCase {
    func testDecodesOrganizationsAfterDelete() throws {
        let json = """
        {
          "success": true,
          "organizations": [
            {
              "id": "org-2",
              "name": "Other Group",
              "slug": "other-group",
              "logo": null,
              "credits": 0,
              "role": "owner",
              "isActive": false
            }
          ]
        }
        """.data(using: .utf8)!

        let response = try JSON.decoder.decode(DeleteGroupResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.organizations.count, 1)
        XCTAssertEqual(response.organizations[0].name, "Other Group")
    }
}
