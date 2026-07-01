import SwiftUI

struct GalleyAddTypeChoiceSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onSelectRecipe: () -> Void = {}
    var onSelectProvision: () -> Void = {}

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("What would you like to add?")
                    .rationHeadline()
                    .frame(maxWidth: .infinity, alignment: .leading)

                choiceButton(
                    systemImage: "frying.pan.fill",
                    title: "Recipe",
                    detail: "Multi-ingredient meal with directions. Good for full dishes.",
                    action: {
                        dismiss()
                        onSelectRecipe()
                    }
                )

                choiceButton(
                    systemImage: "shippingbox.fill",
                    title: "Provision",
                    detail: "Single thing to buy or track. Good for snacks, staples, household.",
                    action: {
                        dismiss()
                        onSelectProvision()
                    }
                )

                Spacer()
            }
            .padding(16)
            .background(Theme.ceramic)
            .navigationTitle("Add to Galley")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func choiceButton(
        systemImage: String,
        title: String,
        detail: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: systemImage)
                    .font(.system(size: 28))
                    .foregroundStyle(Theme.hyperGreen)
                Text(title).rationHeadline()
                Text(detail)
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Theme.platinum, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
