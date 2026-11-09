import Foundation

enum DiaryLayoutMode: String, Hashable {
    case timeline
    case slots

    static func normalize(_ raw: String?) -> DiaryLayoutMode {
        raw == "slots" ? .slots : .timeline
    }
}

struct DiaryLayoutGroup<Row>: Identifiable {
    let id: String
    let label: String?
    let rows: [Row]
}

/// Person-scoped day list. Flag off leaves the rows in the order they arrived.
enum DiaryLayout {
    static let otherLabel = "Other"

    static func controlVisible(fastLogEnabled: Bool, appVersion: String) -> Bool {
        HubCapturePolicy.choiceVisible(fastLogEnabled: fastLogEnabled, appVersion: appVersion)
    }

    static func present<Row>(
        rows: [Row],
        controlVisible: Bool,
        layout: DiaryLayoutMode,
        id: (Row) -> String,
        slot: (Row) -> String?,
        time: (Row) -> Date
    ) -> [DiaryLayoutGroup<Row>] {
        if !controlVisible {
            return [DiaryLayoutGroup(id: "all", label: nil, rows: rows)]
        }
        let ordered = rows.sorted { lhs, rhs in
            let left = time(lhs)
            let right = time(rhs)
            if left != right { return left < right }
            return id(lhs) < id(rhs)
        }
        if layout == .timeline {
            return [DiaryLayoutGroup(id: "timeline", label: nil, rows: ordered)]
        }
        let keys = ["breakfast", "lunch", "dinner", "snack", "other"]
        let labels = [
            "breakfast": "Breakfast",
            "lunch": "Lunch",
            "dinner": "Dinner",
            "snack": "Snack",
            "other": otherLabel,
        ]
        var buckets: [String: [Row]] = [:]
        for row in ordered {
            let raw = slot(row)
            let key: String
            if raw == "breakfast" || raw == "lunch" || raw == "dinner" || raw == "snack" {
                key = raw ?? "other"
            } else {
                key = "other"
            }
            buckets[key, default: []].append(row)
        }
        return keys.compactMap { key in
            guard let group = buckets[key], !group.isEmpty else { return nil }
            return DiaryLayoutGroup(id: key, label: labels[key], rows: group)
        }
    }
}
