import SwiftUI

/// Credits gate before AI features — complements consent gate in ScanView.
struct AIFeatureIntroView: View {
    let title: String
    let detail: String
    let creditCost: Int
    let onContinue: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "sparkles")
                .font(.system(size: 40))
                .foregroundStyle(Theme.hyperGreen)
            Text(title).rationTitle()
            Text(detail)
                .rationCaption()
                .multilineTextAlignment(.center)
            GlassCard {
                HStack {
                    Text("Cost").rationBody()
                    Spacer()
                    Text("\(creditCost) credits").rationHeadline()
                }
            }
            GlassCard {
                HStack {
                    Text("Balance").rationBody()
                    Spacer()
                    Text("\(env.session.credits) credits").rationHeadline()
                }
            }
            Button("Continue") {
                Haptics.light()
                onContinue()
            }
            .buttonStyle(PrimaryButtonStyle())
            Button("Cancel") { dismiss() }
                .buttonStyle(SecondaryButtonStyle())
        }
        .padding(24)
        .background(Theme.ceramic)
    }
}
