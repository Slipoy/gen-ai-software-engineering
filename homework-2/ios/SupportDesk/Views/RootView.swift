import SwiftUI

/// The app's frame: three tabs like the web header (Queue, All tickets, Import) and the toast layer on top.
struct RootView: View {
    var body: some View {
        TabView {
            QueueView()
                .tabItem { Label("Queue", systemImage: "square.stack.3d.up") }
            AllTicketsView()
                .tabItem { Label("Tickets", systemImage: "list.bullet.rectangle") }
            ImportView()
                .tabItem { Label("Import", systemImage: "square.and.arrow.down") }
        }
        .overlay { ToastOverlay() }
    }
}

#Preview {
    RootView().environment(AppState())
}
