import XCTest
@testable import Ration

final class ImportRecipeStatusDecodingTests: XCTestCase {
    func testDecodesProgressEvidenceAndPartialCounts() throws {
        let json = """
        {
          "status": "completed",
          "success": true,
          "extractedRecipe": {
            "name": "Yummy pasta",
            "ingredients": [
              {
                "ingredientName": "spaghetti",
                "quantity": 0,
                "unit": "unit",
                "isOptional": false,
                "orderIndex": 0
              }
            ],
            "customFields": {
              "sourceUrl": "https://www.tiktok.com/@u/video/1",
              "importCompleteness": "skeleton",
              "importEvidence": "oembed,transcript_asr"
            }
          },
          "completeness": "skeleton",
          "softFailToPhoto": false,
          "progress": "extracting",
          "evidence": ["oembed", "transcript_asr"],
          "ingredientCount": 1,
          "stepCount": 3,
          "missingAmountCount": 1
        }
        """
        let decoded = try JSON.decoder.decode(
            ImportRecipeStatusResponse.self,
            from: Data(json.utf8)
        )
        XCTAssertEqual(decoded.status, "completed")
        XCTAssertEqual(decoded.progress, "extracting")
        XCTAssertEqual(decoded.evidence, ["oembed", "transcript_asr"])
        XCTAssertEqual(decoded.ingredientCount, 1)
        XCTAssertEqual(decoded.stepCount, 3)
        XCTAssertEqual(decoded.missingAmountCount, 1)
        XCTAssertEqual(decoded.extractedRecipe?.completenessLabel, "Partial")
        XCTAssertEqual(
            decoded.extractedRecipe?.evidenceLabels,
            ["From caption", "From spoken audio"]
        )
    }

    func testPendingProgressIsOptional() throws {
        let json = """
        { "status": "pending", "progress": "listening_to_video" }
        """
        let decoded = try JSON.decoder.decode(
            ImportRecipeStatusResponse.self,
            from: Data(json.utf8)
        )
        XCTAssertEqual(decoded.status, "pending")
        XCTAssertEqual(decoded.progress, "listening_to_video")
        XCTAssertNil(decoded.extractedRecipe)
    }
}

final class ImportEvidenceLabelsTests: XCTestCase {
    func testDedupesCaptionLabels() {
        XCTAssertEqual(
            ImportEvidenceLabels.summary(from: ["oembed", "user_text", "transcript_asr"]),
            ["From caption", "From spoken audio"]
        )
    }
}

final class RecipePageHtmlTrimmerGraphTests: XCTestCase {
    func testKeepsRecipeInsideAtGraph() throws {
        let html = """
        <html><head>
        <script type="application/ld+json">
        {"@graph":[{"@type":"WebSite","name":"Blog"},{"@type":["Recipe","Article"],"name":"Graph Pasta"}]}
        </script>
        </head><body><p>Boil pasta until al dente then toss.</p></body></html>
        """
        let prepared = try RecipePageHtmlTrimmer.prepareForUpload(html)
        XCTAssertTrue(prepared.contains("Graph Pasta"))
        XCTAssertTrue(prepared.contains("application/ld+json"))
    }
}
