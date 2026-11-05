import Foundation

enum MealNameDisplay {
    /// Shows a stored meal name.
    ///
    /// A name that already has an uppercase letter is returned unchanged, so
    /// "BBQ Chicken" stays "BBQ Chicken". Older all-lowercase rows get a
    /// capital on the first letter of each whitespace-separated word.
    static func text(_ stored: String) -> String {
        guard stored.contains(where: \.isUppercase) == false else {
            return stored
        }
        var result = ""
        result.reserveCapacity(stored.count)
        var atWordStart = true
        for character in stored {
            if character.isWhitespace {
                result.append(character)
                atWordStart = true
            } else if atWordStart {
                result.append(contentsOf: character.uppercased())
                atWordStart = false
            } else {
                result.append(character)
            }
        }
        return result
    }
}
