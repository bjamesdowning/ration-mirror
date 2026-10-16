import AppIntents

struct CargoTagEntity: AppEntity, Identifiable {
    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Cargo tag")
    }

    static var defaultQuery = CargoTagQuery()

    var id: String
    var name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct CargoTagQuery: EntityQuery {
    func entities(for identifiers: [CargoTagEntity.ID]) async throws -> [CargoTagEntity] {
        let choices = HomeWidgetCacheStore.load()?.snapshot?.eat.tagChoices ?? []
        return identifiers.map { id in
            if let match = choices.first(where: { $0.slug == id }) {
                return CargoTagEntity(id: match.slug, name: match.name)
            }
            return CargoTagEntity(id: id, name: id)
        }
    }

    func suggestedEntities() async throws -> [CargoTagEntity] {
        let choices = HomeWidgetCacheStore.load()?.snapshot?.eat.tagChoices ?? []
        return choices.map { CargoTagEntity(id: $0.slug, name: $0.name) }
    }
}

struct EatWidgetConfiguration: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Eat"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Appearance", default: .system)
    var appearance: WidgetAppearance

    @Parameter(title: "Cargo tag")
    var tag: CargoTagEntity?

    func perform() async throws -> some IntentResult {
        .result()
    }
}
