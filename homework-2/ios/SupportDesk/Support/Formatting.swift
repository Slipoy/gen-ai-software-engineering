import Foundation

enum Formatting {
    /// Compact age as a support agent reads it: "now", "8m", "3h", "2d", then a short date.
    static func age(of date: Date, now: Date = .now) -> String {
        let seconds = now.timeIntervalSince(date)
        switch seconds {
        case ..<60: return "now"
        case ..<3600: return "\(Int(seconds / 60))m"
        case ..<86_400: return "\(Int(seconds / 3600))h"
        case ..<(7 * 86_400): return "\(Int(seconds / 86_400))d"
        default: return date.formatted(.dateTime.day().month(.abbreviated))
        }
    }

    static func dateTime(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.abbreviated).hour().minute())
    }

    static func confidence(_ value: Double) -> String {
        String(format: "%.2f", value)
    }
}
