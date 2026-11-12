import SwiftUI

/// Trailing list header showing server total inventory as `"{n} items"`.
struct ListCountHeader: View {
    private let text: String
    private let accessibility: String
    var isLoading: Bool = false

    init(count: Int, isLoading: Bool = false) {
        text = ListCountLabel.format(count)
        accessibility = ListCountLabel.accessibilityLabel(count)
        self.isLoading = isLoading
    }

    init(text: String, isLoading: Bool = false) {
        self.text = text
        accessibility = text
        self.isLoading = isLoading
    }

    var body: some View {
        HStack {
            Spacer()
            if isLoading {
                ProgressView()
                    .controlSize(.mini)
            } else {
                Text(text)
                    .rationCaption()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibility)
        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 0, trailing: 16))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }
}

/// Pure formatting for list inventory totals.
enum ListCountLabel {
    static func format(_ count: Int) -> String {
        "\(count) items"
    }

    static func accessibilityLabel(_ count: Int) -> String {
        format(count)
    }
}
