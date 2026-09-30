import Observation
import SwiftUI

/// Shared state for all screens, handed down through the SwiftUI environment.
/// `@Observable` makes SwiftUI re-render exactly the views that read a property when it changes,
/// much like a small store in React. `@MainActor`: UI state is only touched on the main thread.
@MainActor
@Observable
final class AppState {
    let api: APIClient

    /// Bumped after every change (create, edit, delete, classify, import), so list screens know to reload.
    private(set) var revision = 0

    /// The current toast message, shown by ToastOverlay.
    private(set) var toast: Toast?

    struct Toast: Equatable, Identifiable {
        let id = UUID()
        let message: String
        let isError: Bool
    }

    init(api: APIClient = .live) {
        self.api = api
    }

    func ticketsChanged() {
        revision += 1
    }

    func show(_ message: String, isError: Bool = false) {
        let toast = Toast(message: message, isError: isError)
        self.toast = toast
        // Success disappears by itself; errors stay until tapped.
        guard !isError else { return }
        Task {
            try? await Task.sleep(for: .seconds(3))
            if self.toast?.id == toast.id { self.toast = nil }
        }
    }

    func dismissToast() {
        toast = nil
    }
}
