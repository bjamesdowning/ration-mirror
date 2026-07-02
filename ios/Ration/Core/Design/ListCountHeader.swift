import SwiftUI

/// Trailing list header showing server total inventory as `"{n} items"`.
struct ListCountHeader: View {
    let count: Int
    var isLoading: Bool = false

    var body: some View {
        HStack {
            Spacer()
            if isLoading {
                ProgressView()
                    .controlSize(.mini)
            } else {
                Text(ListCountLabel.format(count))
                    .rationCaption()
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(ListCountLabel.accessibilityLabel(count))
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
