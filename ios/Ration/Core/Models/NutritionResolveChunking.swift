import Foundation

enum NutritionResolveChunking {
    /// Keep under API max (50) so large receipts paint kcal progressively.
    static let clientChunkSize = 10
    static let apiMaxNames = 50

    static func uniqueTrimmedNames(_ names: [String]) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for raw in names {
            let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, !seen.contains(name) else { continue }
            seen.insert(name)
            out.append(name)
        }
        return out
    }

    static func chunks(
        _ names: [String],
        size: Int = clientChunkSize
    ) -> [[String]] {
        let chunkSize = min(max(size, 1), apiMaxNames)
        guard !names.isEmpty else { return [] }
        var result: [[String]] = []
        var index = 0
        while index < names.count {
            let end = min(index + chunkSize, names.count)
            result.append(Array(names[index..<end]))
            index = end
        }
        return result
    }
}
