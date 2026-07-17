import Foundation

/// Pure helpers for searchable tag multi-select pickers.
enum TagFilterQuery {
    /// Returns available tags sorted by display name, optionally filtered by query.
    /// Matches against both slug and display name (case-insensitive).
    static func filterTags(available: [String], query: String) -> [String] {
        let sorted = available.sorted {
            Tag.displayName(from: $0).localizedCaseInsensitiveCompare(Tag.displayName(from: $1))
                == .orderedAscending
        }
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return sorted }
        return sorted.filter { tag in
            tag.localizedCaseInsensitiveContains(needle)
                || Tag.displayName(from: tag).localizedCaseInsensitiveContains(needle)
        }
    }
}
