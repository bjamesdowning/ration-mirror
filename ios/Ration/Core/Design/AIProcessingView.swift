import SwiftUI

enum AIFeature: String {
    case generateMeals
    case planWeek
    case importRecipe
    case scanCargo
    case scanFuel
    case supplyReplenish
    case copilot

    var icon: String {
        switch self {
        case .generateMeals, .copilot: "sparkles"
        case .planWeek: "calendar"
        case .importRecipe: "link"
        case .scanCargo, .supplyReplenish: "camera.viewfinder"
        case .scanFuel: "flame.fill"
        }
    }

    var title: String {
        switch self {
        case .generateMeals: "Generating meals…"
        case .planWeek: "Planning week…"
        case .importRecipe: "Importing recipe…"
        case .scanCargo: "Analyzing photo…"
        case .scanFuel: "Analyzing"
        case .supplyReplenish: "Matching receipt…"
        case .copilot: "Copilot is thinking…"
        }
    }

    var message: String {
        switch self {
        case .generateMeals:
            "Analyzing your Cargo and preferences to suggest recipes you'll actually cook."
        case .planWeek:
            "Building a balanced week from your Galley — matching what's already in Cargo."
        case .importRecipe:
            "Reading the recipe page and mapping ingredients to your inventory units."
        case .scanCargo:
            "Identifying items from your photo and matching them to Cargo entries."
        case .scanFuel:
            "This usually takes a few seconds."
        case .supplyReplenish:
            "Extracting items from your receipt and matching them to your Supply list."
        case .copilot:
            "Checking Ration context and preparing the next precise action."
        }
    }
}

/// Timing shared with `AI_WAIT_MOTION` in `app/lib/ai-wait-motion.ts`.
enum AiWaitMotion {
    static let sweepSeconds = 2.4
    static let breatheSeconds = 1.8
    static let orbitSeconds = 3.6
    static let breatheScale = 1.06
}

enum AiWaitChrome {
    static let field = Color(hex: 0x111111)
    static let ink = Color(hex: 0xF8F9FA)
    static let copy = Color(hex: 0x9CA3AF)
}

/// Full-bleed carbon field for an AI wait. Close stays in the existing toolbar.
struct AiWaitSheetChrome: ViewModifier {
    var active: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if active {
            content
                .background(AiWaitChrome.field.ignoresSafeArea())
                .presentationBackground(AiWaitChrome.field)
                .toolbarColorScheme(.dark, for: .navigationBar)
                .toolbarBackground(.hidden, for: .navigationBar)
        } else {
            content.background(Theme.ceramic)
        }
    }
}

extension View {
    func aiWaitSheetChrome(active: Bool) -> some View {
        modifier(AiWaitSheetChrome(active: active))
    }
}

/// Branded full-screen AI processing state. Each feature keeps its own copy and mark.
struct AIProcessingView: View {
    let feature: AIFeature
    var creditCost: Int?
    /// Optional title when the wait state differs from the feature default (e.g. confirm).
    var titleOverride: String? = nil
    /// Optional body copy paired with `titleOverride`.
    var messageOverride: String? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var title: String { titleOverride ?? feature.title }
    private var message: String { messageOverride ?? feature.message }

    private var spokenStatus: String {
        let headline = title.hasSuffix("…") || title.hasSuffix(".") ? title : "\(title)."
        var sentence = "\(headline) \(message)"
        if let creditCost {
            let noun = creditCost == 1 ? "credit" : "credits"
            sentence += " Uses \(creditCost) \(noun)."
        }
        return sentence
    }

    var body: some View {
        VStack(spacing: 24) {
            AiWaitMark(icon: feature.icon, reduceMotion: reduceMotion)
            VStack(spacing: 8) {
                Text(title)
                    .font(Typography.headline())
                    .foregroundStyle(AiWaitChrome.ink)
                    .multilineTextAlignment(.center)
                Text(message)
                    .font(Typography.caption())
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AiWaitChrome.copy)
                    .padding(.horizontal, 24)
            }
            if let creditCost {
                Text("Uses \(creditCost) credit\(creditCost == 1 ? "" : "s")")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.hyperGreen)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.hyperGreen.opacity(0.12))
                    .clipShape(Capsule())
            }
            if !reduceMotion {
                ProgressView()
                    .tint(Theme.hyperGreen)
                    .controlSize(.small)
                    .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AiWaitChrome.field.ignoresSafeArea())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenStatus)
    }
}

/// Thin sweep, breathing reticle, and a soft arc around the feature mark.
private struct AiWaitMark: View {
    let icon: String
    let reduceMotion: Bool

    @State private var sweep = false
    @State private var orbit = false
    @State private var breathe = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.hyperGreen.opacity(0.28), lineWidth: 1)
                .frame(width: 88, height: 88)
            if !reduceMotion {
                Circle()
                    .trim(from: 0, to: 0.22)
                    .stroke(Theme.hyperGreen, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                    .frame(width: 88, height: 88)
                    .rotationEffect(.degrees(sweep ? 360 : 0))
                Circle()
                    .trim(from: 0, to: 0.14)
                    .stroke(Theme.hyperGreen.opacity(0.55), style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .frame(width: 108, height: 108)
                    .rotationEffect(.degrees(orbit ? -360 : 0))
            }
            AiWaitReticle()
                .stroke(Theme.hyperGreen, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                .frame(width: 46, height: 46)
                .scaleEffect(reduceMotion ? 1 : (breathe ? AiWaitMotion.breatheScale : 1))
            Image(systemName: icon)
                .font(Typography.heroIcon(22))
                .foregroundStyle(Theme.hyperGreen)
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
                orbit = false
                breathe = false
            }
            return
        }
        withAnimation(.linear(duration: AiWaitMotion.sweepSeconds).repeatForever(autoreverses: false)) {
            sweep = true
        }
        withAnimation(.linear(duration: AiWaitMotion.orbitSeconds).repeatForever(autoreverses: false)) {
            orbit = true
        }
        withAnimation(.easeInOut(duration: AiWaitMotion.breatheSeconds).repeatForever(autoreverses: true)) {
            breathe = true
        }
    }
}

private struct AiWaitReticle: Shape {
    func path(in rect: CGRect) -> Path {
        let arm = min(rect.width, rect.height) * 0.32
        let inset = min(rect.width, rect.height) * 0.08
        var path = Path()
        func corner(_ x: CGFloat, _ y: CGFloat, _ dx: CGFloat, _ dy: CGFloat) {
            path.move(to: CGPoint(x: x, y: y + dy * arm))
            path.addLine(to: CGPoint(x: x, y: y))
            path.addLine(to: CGPoint(x: x + dx * arm, y: y))
        }
        corner(rect.minX + inset, rect.minY + inset, 1, 1)
        corner(rect.maxX - inset, rect.minY + inset, -1, 1)
        corner(rect.maxX - inset, rect.maxY - inset, -1, -1)
        corner(rect.minX + inset, rect.maxY - inset, 1, -1)
        return path
    }
}
