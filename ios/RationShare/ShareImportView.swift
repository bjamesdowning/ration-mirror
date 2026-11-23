import SwiftUI

struct ShareImportView: View {
    let url: URL
    let userText: String?
    let onOpen: () async -> Bool
    let onFinish: () -> Void
    @State private var coordinator = ShareImportCoordinator()
    @State private var openRefused = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if coordinator.state == .started {
                handoff
            } else {
                statusStack
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(coordinator.state == .started ? ShareImportPalette.carbon : background)
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

    private var handoff: some View {
        VStack(spacing: 24) {
            ShareImportMark(reduceMotion: reduceMotion)
            VStack(spacing: 8) {
                Text(ShareImportCopy.importingTitle)
                    .font(.system(.headline, design: .monospaced))
                    .foregroundStyle(ShareImportPalette.ink)
                    .multilineTextAlignment(.center)
                Text(ShareImportCopy.importingBody)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(ShareImportPalette.muted)
                    .multilineTextAlignment(.center)
            }
            .accessibilityElement(children: .combine)
            VStack(spacing: 12) {
                Button(ShareImportCopy.openRation) {
                    Task {
                        let opened = await onOpen()
                        if opened {
                            if coordinator.userRequestedFinish() {
                                onFinish()
                            }
                        } else {
                            openRefused = true
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(ShareImportPalette.hyperGreen)
                Button("Done") {
                    if coordinator.userRequestedFinish() {
                        onFinish()
                    }
                }
                .buttonStyle(.bordered)
                .tint(ShareImportPalette.ink)
            }
            if openRefused {
                Text(ShareImportCopy.openRationRefused)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(ShareImportPalette.muted)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(24)
    }

    private var statusStack: some View {
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
                .tint(ShareImportPalette.hyperGreen)
            }
            if case .readyToAdd = coordinator.state {
                Button(ShareImportCopy.addToGalley) {
                    Task { await coordinator.addToGalley() }
                }
                .buttonStyle(.borderedProminent)
                .tint(ShareImportPalette.hyperGreen)
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
    }

    private var title: String {
        switch coordinator.state {
        case .idle:
            ShareImportCopy.preparing(host: "this page", cost: nil)
        case .preparing(let host, let cost):
            ShareImportCopy.preparing(host: host, cost: cost)
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
            ShareImportCopy.importingTitle
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

/// Colors copied from AiWaitChrome and Theme. The share target does not compile those types.
private enum ShareImportPalette {
    static let carbon = Color(red: 17 / 255, green: 17 / 255, blue: 17 / 255)
    static let ink = Color(red: 248 / 255, green: 249 / 255, blue: 250 / 255)
    static let muted = Color(red: 156 / 255, green: 163 / 255, blue: 175 / 255)
    static let hyperGreen = Color(red: 0, green: 224 / 255, blue: 136 / 255)
}

/// Link mark from AIFeature.importRecipe. Space Mono and AiWaitMark are not in this target.
private struct ShareImportMark: View {
    let reduceMotion: Bool
    @State private var sweep = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(ShareImportPalette.hyperGreen.opacity(0.28), lineWidth: 1)
                .frame(width: 88, height: 88)
            if !reduceMotion {
                Circle()
                    .trim(from: 0, to: 0.22)
                    .stroke(
                        ShareImportPalette.hyperGreen,
                        style: StrokeStyle(lineWidth: 1.5, lineCap: .round)
                    )
                    .frame(width: 88, height: 88)
                    .rotationEffect(.degrees(sweep ? 360 : 0))
            }
            Image(systemName: "link")
                .font(.system(size: 22))
                .foregroundStyle(ShareImportPalette.hyperGreen)
        }
        .frame(width: 120, height: 120)
        .accessibilityHidden(true)
        .onAppear { syncMotion() }
        .onChange(of: reduceMotion) { _, _ in syncMotion() }
    }

    private func syncMotion() {
        guard !reduceMotion else {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                sweep = false
            }
            return
        }
        withAnimation(.linear(duration: 2.4).repeatForever(autoreverses: false)) {
            sweep = true
        }
    }
}
