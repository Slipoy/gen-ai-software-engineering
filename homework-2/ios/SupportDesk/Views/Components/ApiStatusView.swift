import SwiftUI

/// Is the backend reachable? Polls /health every 15 s while the view is on screen,
/// the same indicator as ApiStatus.tsx on the web.
struct ApiStatusView: View {
    enum State: Equatable {
        case checking, online, offline
    }

    var api: APIClient = .live
    @SwiftUI.State private var state: State = .checking

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.caption)
                .foregroundStyle(state == .offline ? Theme.danger : Theme.textMuted)
        }
        .accessibilityElement(children: .combine)
        // `.task` starts when the view appears and is cancelled automatically when it disappears.
        .task {
            while !Task.isCancelled {
                do {
                    _ = try await api.health()
                    state = .online
                } catch {
                    state = .offline
                }
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    private var label: String {
        switch state {
        case .checking: "Connecting…"
        case .online: "API online"
        case .offline: "API offline"
        }
    }

    private var color: Color {
        switch state {
        case .checking: Theme.textMuted
        case .online: Theme.success
        case .offline: Theme.danger
        }
    }
}
