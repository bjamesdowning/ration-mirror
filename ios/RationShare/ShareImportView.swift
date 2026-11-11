import SwiftUI

struct ShareImportView: View {
    let url: URL
    let userText: String?
    let onFinish: () -> Void
    @State private var coordinator = ShareImportCoordinator()

    var body: some View {
        VStack(spacing: 16) {
            Text(title)
                .font(.system(.body, design: .monospaced))
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.primary)
            if case .needsConsent = coordinator.state {
                Text(ShareImportCopy.disclosure)
                    .font(.system(.footnote, design: .monospaced))
                    .multilineTextAlignment(.center)
                Button(ShareImportCopy.allowAndImport) {
                    Task { await coordinator.allowAndImport() }
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0, green: 0.878, blue: 0.533))
            }
            if case .readyToAdd = coordinator.state {
                Button(ShareImportCopy.addToGalley) {
                    Task { await coordinator.addToGalley() }
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0, green: 0.878, blue: 0.533))
            }
            if coordinator.finishAllowed {
                Button("Done") {
                    if coordinator.userRequestedFinish() {
                        onFinish()
                    }
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(background)
        .task {
            guard let store = SharedImportStore.appGroup() else {
                coordinator.failClosed()
                return
            }
            await coordinator.begin(
                url: url,
                userText: userText,
                service: ShareImportLiveService(),
                store: store
            )
        }
    }

    private var title: String {
        switch coordinator.state {
        case .idle, .preparing:
            ShareImportCopy.preparing
        case .needsConsent:
            "Allow AI features?"
        case .unavailable:
            ShareImportCopy.unavailable
        case .needsCredits(let required):
            ShareImportCopy.insufficientCredits(required: required)
        case .signedOut:
            ShareImportCopy.signedOut
        case .offline:
            ShareImportCopy.offline
        case .unauthorized:
            ShareImportCopy.unauthorized
        case .rateLimited:
            ShareImportCopy.rateLimited
        case .duplicate(let name):
            if let name, !name.isEmpty {
                "Already in Galley: \(name)"
            } else {
                "This recipe is already in Galley."
            }
        case .failed(let message):
            message
        case .siteBlocked:
            ShareImportCopy.siteBlocked
        case .progress(let label):
            label
        case .started:
            ShareImportCopy.importStarted
        case .readyToAdd:
            "Recipe ready"
        case .addedToGalley:
            ShareImportCopy.addedToGalley
        case .queueFull:
            ShareImportCopy.queueFull
        }
    }

    private var background: Color {
        Color(UIColor { traits in
            if traits.userInterfaceStyle == .dark {
                return UIColor(red: 0.051, green: 0.051, blue: 0.051, alpha: 1)
            }
            return UIColor(red: 0.973, green: 0.976, blue: 0.980, alpha: 1)
        })
    }
}
