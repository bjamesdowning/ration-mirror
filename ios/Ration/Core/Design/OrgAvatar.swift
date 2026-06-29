import SwiftUI

enum OrgAvatarHelpers {
  private static let palette: [(bg: Color, fg: Color)] = [
    (Theme.hyperGreen.opacity(0.2), Theme.hyperGreen),
    (Theme.hyperGreen.opacity(0.4), Theme.carbon),
    (Theme.carbon.opacity(0.1), Theme.carbon),
    (Theme.platinum, Theme.carbon),
  ]

  static func initials(for name: String) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "?" }
    let words = trimmed.split(separator: " ").filter { !$0.isEmpty }
    if words.count >= 2 {
      let a = words[0].prefix(1)
      let b = words[1].prefix(1)
      return "\(a)\(b)".uppercased()
    }
    if trimmed.count >= 2 {
      return String(trimmed.prefix(2)).uppercased()
    }
    return String(trimmed.prefix(1)).uppercased()
  }

  static func colors(for orgId: String) -> (bg: Color, fg: Color) {
    var hash = 0
    for scalar in orgId.unicodeScalars {
      hash = (hash << 5) &- hash &+ Int(scalar.value)
    }
    let index = abs(hash) % palette.count
    return palette[index]
  }
}

struct OrgAvatar: View {
  let name: String
  let orgId: String
  var imageURL: String?
  var size: CGFloat = 32

  private var safeImageURL: URL? {
    guard let raw = imageURL?.trimmingCharacters(in: .whitespacesAndNewlines),
          !raw.isEmpty,
          let url = URL(string: raw),
          url.scheme == "https"
    else { return nil }
    return url
  }

  var body: some View {
    Group {
      if let url = safeImageURL {
        AsyncImage(url: url) { phase in
          switch phase {
          case .success(let image):
            image.resizable().scaledToFill()
          default:
            initialsView
          }
        }
      } else {
        initialsView
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(Circle().stroke(Theme.platinum, lineWidth: 1))
  }

  private var initialsView: some View {
    let colors = OrgAvatarHelpers.colors(for: orgId)
    return Text(OrgAvatarHelpers.initials(for: name))
      .font(.system(size: size * 0.38, weight: .bold, design: .monospaced))
      .foregroundStyle(colors.fg)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(colors.bg)
  }
}
