import SwiftUI

@main
struct SupportDeskApp: App {
    /// One shared AppState for the whole app, like a React context provider at the root.
    @State private var app = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
    }
}
