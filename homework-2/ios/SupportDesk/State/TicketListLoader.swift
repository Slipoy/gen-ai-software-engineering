import Observation

/// Loads a ticket list for a screen and keeps the previous result on screen while the next one loads
/// (TanStack Query's `keepPreviousData` on the web), so changing a filter does not flash an empty list.
@MainActor
@Observable
final class TicketListLoader {
    private(set) var tickets: [Ticket] = []
    private(set) var error: APIError?
    private(set) var isLoading = false
    /// false until the first answer arrives: only then "no tickets" really means none.
    private(set) var hasLoaded = false

    func load(_ query: TicketQuery, api: APIClient) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let result = try await api.tickets(query)
            // A newer load may have started meanwhile (the filter changed again); its task cancelled this one.
            guard !Task.isCancelled else { return }
            tickets = result
            error = nil
            hasLoaded = true
        } catch {
            guard !Task.isCancelled else { return }
            self.error = APIError.from(error)
        }
    }
}

/// What a list screen reloads on: its filters plus the app-wide revision bumped after every change.
struct LoadKey: Hashable {
    let query: TicketQuery
    let revision: Int
}
