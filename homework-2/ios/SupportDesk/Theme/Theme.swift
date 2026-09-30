import SwiftUI

/// Switchboard design tokens: the same palette as frontend/src/styles/tokens.css.
/// Native apps use the system fonts (SF Pro, SF Mono) instead of bundling web fonts: they render best
/// on iOS and scale with the user's Dynamic Type text size.
enum Theme {
    static let background = Color(hex: 0x111318)
    static let surface1 = Color(hex: 0x161920)
    static let surface2 = Color(hex: 0x1A1D24)
    static let surface3 = Color(hex: 0x1F232C)
    static let selected = Color(hex: 0x232833)
    static let border = Color(hex: 0x262A33)
    static let borderStrong = Color(hex: 0x2D323C)

    static let text = Color(hex: 0xE7E9EE)
    static let textSecondary = Color(hex: 0xC9CED8)
    static let textMuted = Color(hex: 0x9AA1AD)

    static let accent = Color(hex: 0xF3B04F)
    static let accentText = Color(hex: 0xFFD28C)
    static let onAccent = Color(hex: 0x1A1406)

    static let success = Color(hex: 0x6FD39A)
    static let danger = Color(hex: 0xFF8A7F)

    static func color(for priority: Priority) -> Color {
        switch priority {
        case .urgent: Color(hex: 0xFF8A7F)
        case .high: Color(hex: 0xF3B04F)
        case .medium: Color(hex: 0x8FB4FF)
        case .low: Color(hex: 0x9AA1AD)
        }
    }
}

extension Color {
    /// `Color(hex: 0xF3B04F)`, matching the hex values in the web tokens.
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

extension Font {
    /// Monospaced text for ids, counts and confidence values (JetBrains Mono on the web).
    static func mono(_ style: Font.TextStyle = .caption) -> Font {
        .system(style, design: .monospaced)
    }
}
