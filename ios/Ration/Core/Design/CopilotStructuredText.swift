import SwiftUI
import Textual

/// Shared Textual renderer for Copilot / onboarding assistant markdown.
/// Structured blocks for chat readability + native text selection (no contextMenu lift).
struct CopilotStructuredText: View {
    let markdown: String

    var body: some View {
        StructuredText(markdown: markdown.isEmpty ? " " : markdown)
            .font(Typography.body())
            .foregroundStyle(Theme.carbon)
            .tint(Theme.hyperGreen)
            .textual.structuredTextStyle(Self.style)
            .textual.overflowMode(.wrap)
            .textual.textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Stable style instance — avoids reallocating on every streaming token.
    private static let style = RationCopilotStructuredTextStyle()
}

/// GitHub-like block structure with Ration Orbital Luxury accents (Hyper-Green links).
private struct RationCopilotStructuredTextStyle: StructuredText.Style {
    let inlineStyle: InlineStyle = InlineStyle()
        .code(
            .monospaced,
            .fontScale(0.85),
            .backgroundColor(Theme.platinum)
        )
        .strong(.fontWeight(.semibold))
        .link(.foregroundColor(Theme.hyperGreen))

    let headingStyle: StructuredText.GitHubHeadingStyle = .gitHub
    let paragraphStyle: StructuredText.GitHubParagraphStyle = .gitHub
    let blockQuoteStyle: StructuredText.GitHubBlockQuoteStyle = .gitHub
    let codeBlockStyle: StructuredText.GitHubCodeBlockStyle = .gitHub
    let listItemStyle: StructuredText.DefaultListItemStyle = .default
    let unorderedListMarker: StructuredText.HierarchicalSymbolListMarker = .hierarchical(
        .disc, .circle, .square
    )
    let orderedListMarker: StructuredText.DecimalListMarker = .decimal
    let tableStyle: StructuredText.GitHubTableStyle = .gitHub
    let tableCellStyle: StructuredText.GitHubTableCellStyle = .gitHub
    let thematicBreakStyle: StructuredText.GitHubThematicBreakStyle = .gitHub
}
