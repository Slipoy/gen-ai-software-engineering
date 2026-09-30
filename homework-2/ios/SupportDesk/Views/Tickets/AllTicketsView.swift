import SwiftUI

/// Every ticket, including resolved and closed ones, with filters by status, priority and category
/// (TicketsPage.tsx on the web). Newest first: this screen is for looking things up, not for working a queue.
struct AllTicketsView: View {
    @Environment(AppState.self) private var app
    @State private var loader = TicketListLoader()
    @State private var statuses: Set<Status> = []
    @State private var priorities: Set<Priority> = []
    @State private var categories: Set<Category> = []
    @State private var search = ""
    @State private var isCreating = false
    /// The navigation stack is owned here, not by the list rows: when an edit moves the open ticket
    /// out of this list (another priority, a closed status), its row disappears but the screen stays.
    @State private var path: [TicketRoute] = []

    private var query: TicketQuery {
        TicketQuery(
            category: Category.allCases.filter(categories.contains),
            priority: Priority.allCases.filter(priorities.contains),
            status: Status.allCases.filter(statuses.contains),
            search: search
        )
    }

    private var hasFilters: Bool {
        !statuses.isEmpty || !priorities.isEmpty || !categories.isEmpty || !search.isEmpty
    }

    var body: some View {
        let tickets = loader.tickets.sorted { $0.createdAt > $1.createdAt }

        NavigationStack(path: $path) {
            List {
                Section {
                    if let error = loader.error, !loader.hasLoaded {
                        LoadErrorView(error: error) { await loader.load(query, api: app.api) }
                            .listRowBackground(Color.clear)
                    } else if !loader.hasLoaded {
                        ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
                            .listRowBackground(Color.clear)
                    } else if tickets.isEmpty {
                        ContentUnavailableView(
                            hasFilters ? "No matches" : "No tickets yet",
                            systemImage: hasFilters ? "magnifyingglass" : "tray",
                            description: Text(hasFilters ? "Try other filters." : "Create one with + or import a file.")
                        )
                        .listRowBackground(Color.clear)
                    } else {
                        ForEach(tickets) { ticket in
                            TicketRow(ticket: ticket) { path.append($0) }
                        }
                    }
                } header: {
                    VStack(alignment: .leading, spacing: 10) {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                MultiSelectMenu(title: "Status", options: Status.allCases, label: \.label, selection: $statuses)
                                MultiSelectMenu(title: "Priority", options: Priority.allCases, label: \.label, selection: $priorities)
                                MultiSelectMenu(title: "Category", options: Category.allCases, label: \.label, selection: $categories)
                            }
                        }
                        HStack {
                            Text(loader.hasLoaded ? "\(tickets.count) tickets" : " ")
                                .font(.mono(.caption))
                                .foregroundStyle(Theme.textMuted)
                            Spacer()
                            if loader.isLoading && loader.hasLoaded { ProgressView().controlSize(.small) }
                            if hasFilters {
                                Button("Reset") {
                                    statuses = []
                                    priorities = []
                                    categories = []
                                    search = ""
                                }
                                .font(.caption.weight(.semibold))
                            }
                        }
                    }
                    .textCase(nil)
                    .padding(.bottom, 4)
                }
                .listRowBackground(Theme.surface2)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("All tickets")
            .navigationDestination(for: TicketRoute.self) { TicketDetailView(id: $0.id) }
            .searchable(text: $search, prompt: "Search subject, description, customer")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isCreating = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("New ticket")
                }
            }
            .refreshable { await loader.load(query, api: app.api) }
            .task(id: LoadKey(query: query, revision: app.revision)) {
                if !search.isEmpty {
                    try? await Task.sleep(for: .milliseconds(250))
                    guard !Task.isCancelled else { return }
                }
                await loader.load(query, api: app.api)
            }
            .sheet(isPresented: $isCreating) { TicketFormView(mode: .create) }
        }
    }
}
