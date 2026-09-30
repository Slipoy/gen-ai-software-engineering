import SwiftUI

/// Small rounded label: tags, keywords, category and status badges.
struct Chip: View {
    let text: String
    var color: Color = Theme.textSecondary
    var mono = false

    var body: some View {
        Text(text)
            .font(mono ? .mono(.caption) : .caption.weight(.medium))
            .foregroundStyle(color)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Theme.surface3, in: Capsule())
            .overlay(Capsule().stroke(Theme.border))
    }
}

/// "URGENT" in the priority colour, with a dot in front: the main signal on a card.
struct PriorityBadge: View {
    let priority: Priority

    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(Theme.color(for: priority)).frame(width: 7, height: 7)
            Text(priority.label.uppercased())
                .font(.caption2.weight(.bold))
                .tracking(0.6)
                .foregroundStyle(Theme.color(for: priority))
        }
        .accessibilityLabel("Priority \(priority.label)")
    }
}

/// Lays children out left to right and wraps to the next line, like `flex-wrap: wrap` on the web.
/// SwiftUI has no built-in wrapping stack, so this implements the `Layout` protocol (iOS 16+).
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let extra = rows[rows.count - 1].indices.isEmpty ? size.width : size.width + spacing
            if rows[rows.count - 1].width + extra > width, !rows[rows.count - 1].indices.isEmpty {
                rows.append(Row())
            }
            let isFirst = rows[rows.count - 1].indices.isEmpty
            rows[rows.count - 1].indices.append(index)
            rows[rows.count - 1].width += isFirst ? size.width : size.width + spacing
            rows[rows.count - 1].height = max(rows[rows.count - 1].height, size.height)
        }
        return rows
    }
}

/// A section title in the Switchboard style: small, uppercase, muted.
struct SectionTitle: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.semibold))
            .tracking(0.8)
            .foregroundStyle(Theme.textMuted)
    }
}

/// Loading / error / empty placeholders shared by the list screens (QueryState.tsx on the web).
struct LoadErrorView: View {
    let error: APIError
    let retry: () async -> Void

    var body: some View {
        ContentUnavailableView {
            Label(error.title, systemImage: error.status == 0 ? "wifi.exclamationmark" : "exclamationmark.triangle")
        } description: {
            Text(error.message)
        } actions: {
            Button("Try again") { Task { await retry() } }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(Theme.onAccent)
        }
    }
}

/// Toast at the bottom of the screen; it announces itself to VoiceOver like `aria-live` on the web.
struct ToastOverlay: View {
    @Environment(AppState.self) private var app

    var body: some View {
        VStack {
            Spacer()
            if let toast = app.toast {
                HStack(spacing: 10) {
                    Image(systemName: toast.isError ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                        .foregroundStyle(toast.isError ? Theme.danger : Theme.success)
                    Text(toast.message)
                        .font(.subheadline)
                        .foregroundStyle(Theme.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Theme.surface3, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.borderStrong))
                .shadow(color: .black.opacity(0.4), radius: 12, y: 4)
                .padding(.horizontal, 16)
                .padding(.bottom, 58)
                .onTapGesture { app.dismissToast() }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .id(toast.id)
                .onAppear { AccessibilityNotification.Announcement(toast.message).post() }
            }
        }
        .animation(.spring(duration: 0.3), value: app.toast)
    }
}
