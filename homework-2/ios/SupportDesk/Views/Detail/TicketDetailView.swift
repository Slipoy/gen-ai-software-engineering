import SwiftUI

/// Everything about one ticket: what the customer wrote, the classifier's view, the details and
/// who decided what (TicketPanel.tsx on the web). Edit and Delete live in the toolbar menu.
struct TicketDetailView: View {
    let id: String

    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var ticket: Ticket?
    @State private var decisions: [ClassificationDecision]?
    @State private var error: APIError?
    @State private var isEditing = false
    @State private var isConfirmingDelete = false
    /// Set once the ticket is deleted, so the reload triggered by that change does not fetch a 404.
    @State private var isDeleted = false

    var body: some View {
        Group {
            if let ticket {
                content(ticket)
            } else if let error {
                LoadErrorView(error: error) { await load() }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.background)
        .navigationTitle(ticket.map { "#" + $0.id.prefix(8) } ?? "Ticket")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if ticket != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { isEditing = true } label: { Label("Edit", systemImage: "pencil") }
                        Button(role: .destructive) { isConfirmingDelete = true } label: { Label("Delete", systemImage: "trash") }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Ticket actions")
                }
            }
        }
        .confirmationDialog("Delete this ticket?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Delete ticket", role: .destructive) { Task { await delete() } }
        } message: {
            Text("It is removed for everyone, together with its decision log. This cannot be undone.")
        }
        .sheet(isPresented: $isEditing) {
            if let ticket { TicketFormView(mode: .edit(ticket)) }
        }
        .refreshable { await load() }
        .task(id: app.revision) { await load() }
    }

    private func content(_ ticket: Ticket) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header(ticket)
                card {
                    SectionTitle(text: "Description")
                    Text(ticket.description)
                        .font(.body)
                        .foregroundStyle(Theme.textSecondary)
                        .textSelection(.enabled)
                }
                ClassificationCardView(ticket: ticket)
                details(ticket)
                card {
                    SectionTitle(text: "Decision log")
                    DecisionLogView(decisions: decisions)
                }
            }
            .padding(16)
        }
    }

    private func header(_ ticket: Ticket) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                PriorityBadge(priority: ticket.priority)
                Chip(text: ticket.status.label)
                Chip(text: ticket.category.label)
                if ticket.manualOverride {
                    Chip(text: "Set by agent", color: Theme.accentText)
                }
            }
            Text(ticket.subject)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.text)
            VStack(alignment: .leading, spacing: 2) {
                Text(ticket.customerName).foregroundStyle(Theme.textSecondary)
                Text(ticket.customerEmail)
                    .font(.footnote)
                    .foregroundStyle(Theme.textMuted)
                    .textSelection(.enabled)
            }
        }
    }

    private func details(_ ticket: Ticket) -> some View {
        card {
            SectionTitle(text: "Details")
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                row("Customer ID", ticket.customerId, mono: true)
                row("Assignee", ticket.assignedTo ?? "Unassigned")
                row("Source", ticket.metadata.source.label)
                if let browser = ticket.metadata.browser { row("Browser", browser) }
                if let device = ticket.metadata.deviceType { row("Device", device.rawValue.capitalized) }
                row("Created", Formatting.dateTime(ticket.createdAt))
                row("Updated", Formatting.dateTime(ticket.updatedAt))
                if let resolved = ticket.resolvedAt { row("Resolved", Formatting.dateTime(resolved)) }
                row("ID", ticket.id, mono: true)
            }
            if !ticket.tags.isEmpty {
                FlowLayout {
                    ForEach(ticket.tags, id: \.self) { Chip(text: "#" + $0) }
                }
                .padding(.top, 4)
            }
        }
    }

    private func row(_ label: String, _ value: String, mono: Bool = false) -> some View {
        GridRow {
            Text(label)
                .font(.footnote)
                .foregroundStyle(Theme.textMuted)
            Text(value)
                .font(mono ? .mono(.footnote) : .footnote)
                .foregroundStyle(Theme.textSecondary)
                .textSelection(.enabled)
        }
    }

    private func card(@ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Theme.surface2, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border))
    }

    private func load() async {
        guard !isDeleted else { return }
        // Both requests run at the same time (`async let`), like two useQuery hooks on the web.
        async let ticketRequest = app.api.ticket(id: id)
        async let historyRequest = app.api.classificationHistory(id: id)
        do {
            ticket = try await ticketRequest
            error = nil
        } catch {
            if !Task.isCancelled { self.error = APIError.from(error) }
        }
        decisions = try? await historyRequest
    }

    private func delete() async {
        do {
            try await app.api.deleteTicket(id: id)
            isDeleted = true
            app.show("Ticket deleted.")
            dismiss()
            app.ticketsChanged()
        } catch {
            app.show("Could not delete: \(APIError.from(error).message)", isError: true)
        }
    }
}
