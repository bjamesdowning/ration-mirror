import Foundation

enum QuantityValidation {
    enum Result: Equatable {
        case valid(Double)
        case invalid(String)
    }

    static func validate(_ text: String, locale: Locale = .current) -> Result {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return .invalid("Enter a quantity.")
        }

        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.isLenient = false
        guard let number = formatter.number(from: trimmed) else {
            return .invalid("Quantity must be a number.")
        }
        let value = number.doubleValue
        guard value.isFinite, value > 0 else {
            return .invalid("Quantity must be greater than zero.")
        }
        return .valid(value)
    }
}
