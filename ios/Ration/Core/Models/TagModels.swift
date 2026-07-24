import Foundation

// MARK: - Tags

struct Tag: Codable, Sendable, Hashable, Identifiable {
    let id: String
    let slug: String
    let name: String
    let color: String?
    let category: String?

    init(id: String, slug: String, name: String, color: String? = nil, category: String? = nil) {
        self.id = id
        self.slug = slug
        self.name = name
        self.color = color
        self.category = category
    }

    init(slug: String) {
        id = slug
        self.slug = slug
        name = Tag.displayName(from: slug)
        color = nil
        category = nil
    }

    static func displayName(from slug: String) -> String {
        slug
            .split(separator: "-")
            .filter { !$0.isEmpty }
            .map { word in
                word.prefix(1).uppercased() + word.dropFirst()
            }
            .joined(separator: " ")
    }
}

struct TagWithCounts: Codable, Sendable, Identifiable {
    let id: String
    let slug: String
    let name: String
    let color: String?
    let category: String?
    let cargoCount: Int
    let mealCount: Int
}

struct OrganizationTagsResponse: Codable, Sendable {
    let tags: [TagWithCounts]
}

struct CreateTagRequest: Encodable, Sendable {
    let name: String
    var color: String?
    var category: String?
}

struct UpdateTagRequest: Encodable, Sendable {
    var name: String?
    var color: String?
    var category: String?
}

struct TagMutationResponse: Codable, Sendable {
    let tag: TagRecord
}

struct TagRecord: Codable, Sendable, Identifiable {
    let id: String
    let slug: String
    let name: String
    let color: String?
    let category: String?
}

struct MergeTagRequest: Encodable, Sendable {
    let targetId: String
}
