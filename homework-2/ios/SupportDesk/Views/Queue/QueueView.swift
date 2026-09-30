import SwiftUI

/// Where an agent spends the day: open tickets by priority, oldest first inside each one.
/// On the web this is a board with four columns; a phone has room for one, so the priorities
/// become tabs with counts (the same as the web board at phone width).
struct QueueView: View {
    @Environment(AppState.self) private var app
    @State private var loader = TicketListLoader()
    @State private var priority: Priority = .urgent
    @State private var categories: Set<Category> = []
    @State private var search = ""
    @State private var isCreating = false
    /// The navigation stack is owned here, not by the list rows: when an edit moves the open ticket
    /// out of this list (another priority, a closed status), its row disappears but the screen stays.
    @State private var path: [TicketRoute] = []

    private var query: TicketQuery {
        TicketQuery(category: Category.allCases.filter(categories.contains), status: Status.open, search: search)
    }

    var body: some View {
        let groups = loader.tickets.grouped()
        let visible = groups[priority] ?? []

        NavigationStack(path: $path) {
            List {
                Section {
                    content(visible)
                } header: {
                    VStack(alignment: .leading, spacing: 12) {
                        PriorityTabs(selection: $priority, counts: groups.mapValues(\.count))
                        HStack {
                            MultiSelectMenu(title: "Category", options: Category.allCases, label: \.label, selection: $categories)
                            Spacer()
                            if loader.isLoading && loader.hasLoaded { ProgressView().controlSize(.small) }
                        }
                    }
                    .textCase(nil)
                    .padding(.bottom, 6)
                }
                .listRowBackground(Theme.surface2)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("Queue")
            .navigationDestination(for: TicketRoute.self) { TicketDetailView(id: $0.id) }
            .searchable(text: $search, prompt: "Search subject, description, customer")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { ApiStatusView(api: app.api) }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isCreating = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("New ticket")
                }
            }
            .refreshable { await loader.load(query, api: app.api) }
            // Runs on appear and again whenever the filters or data change; the previous run is cancelled.
            .task(id: LoadKey(query: query, revision: app.revision)) {
                if !search.isEmpty {
                    // Debounce typing: wait until the agent pauses before asking the server.
                    try? await Task.sleep(for: .milliseconds(250))
                    guard !Task.isCancelled else { return }
                }
                await loader.load(query, api: app.api)
            }
            .sheet(isPresented: $isCreating) { TicketFormView(mode: .create) }
        }
    }

    @ViewBuilder
    private func content(_ visible: [Ticket]) -> some View {
        if let error = loader.error, !loader.hasLoaded {
            LoadErrorView(error: error) { await loader.load(query, api: app.api) }
                .listRowBackground(Color.clear)
        } else if !loader.hasLoaded {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                .listRowBackground(Color.clear)
        } else if visible.isEmpty {
            ContentUnavailableView(
                search.isEmpty && categories.isEmpty ? "Nothing \(priority.label.lowercased()) in the queue" : "No matches",
                systemImage: search.isEmpty && categories.isEmpty ? "checkmark.seal" : "magnifyingglass",
                description: Text(search.isEmpty && categories.isEmpty ? "New tickets will show up here." : "Try another search or category.")
            )
            .listRowBackground(Color.clear)
        } else {
            // List is lazy: it only builds the rows on screen, so hundreds of tickets stay smooth.
            ForEach(visible) { ticket in
                TicketRow(ticket: ticket, showsPriority: false) { path.append($0) }
            }
        }
    }
}

/// Navigation target for a ticket. Its own type (not a bare String) so destinations cannot mix up routes.
struct TicketRoute: Hashable {
    let id: String
}

/// Four priority tabs with a count each; the selected one is underlined in its colour.
struct PriorityTabs: View {
    @Binding var selection: Priority
    let counts: [Priority: Int]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Priority.allCases) { priority in
                let isSelected = priority == selection
                Button {
                    selection = priority
                } label: {
                    VStack(spacing: 6) {
                        HStack(spacing: 5) {
                            Text(priority.label.uppercased())
                                .font(.caption.weight(.bold))
                                .tracking(0.5)
                            Text("\(counts[priority] ?? 0)")
                                .font(.mono(.caption))
                                .foregroundStyle(isSelected ? Theme.text : Theme.textMuted)
                        }
                        .foregroundStyle(isSelected ? Theme.color(for: priority) : Theme.textMuted)
                        Rectangle()
                            .fill(isSelected ? Theme.color(for: priority) : .clear)
                            .frame(height: 2)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(priority.label), \(counts[priority] ?? 0) tickets")
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1) }
        .animation(.easeOut(duration: 0.15), value: selection)
    }
}
