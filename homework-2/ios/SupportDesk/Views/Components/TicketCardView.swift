import SwiftUI

/// One ticket in a list: priority, subject, customer, category, age. Mirrors TicketCard.tsx.
/// A plain value view (only `let` inputs), so SwiftUI skips re-rendering it while its ticket is unchanged,
/// which is what `React.memo` does for the web card.
struct TicketCardView: View {
    let ticket: Ticket
    var showsPriority = true

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                if showsPriority { PriorityBadge(priority: ticket.priority) }
                Text(ticket.status.label)
                    .font(.caption)
                    .foregroundStyle(Theme.textMuted)
                if ticket.manualOverride {
                    Image(systemName: "hand.raised.fill")
                        .font(.caption2)
                        .foregroundStyle(Theme.accentText)
                        .accessibilityLabel("Set by an agent")
                }
                Spacer()
                Text(Formatting.age(of: ticket.createdAt))
                    .font(.mono(.caption))
                    .foregroundStyle(Theme.textMuted)
            }
            Text(ticket.subject)
                .font(.body.weight(.semibold))
                .foregroundStyle(Theme.text)
                .lineLimit(2)
            HStack(spacing: 6) {
                Text(ticket.customerName)
                    .foregroundStyle(Theme.textSecondary)
                    .lineLimit(1)
                Text("·").foregroundStyle(Theme.textMuted)
                Text(ticket.category.label)
                    .foregroundStyle(Theme.textMuted)
                    .lineLimit(1)
                if let assignee = ticket.assignedTo {
                    Spacer(minLength: 4)
                    Label(assignee, systemImage: "person.fill")
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                }
            }
            .font(.footnote)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// A tappable list row that opens a ticket. A Button rather than NavigationLink: the screen pushes onto a
/// path it owns, so the detail stays open even when the row leaves the list after an edit.
struct TicketRow: View {
    let ticket: Ticket
    var showsPriority = true
    let open: (TicketRoute) -> Void

    var body: some View {
        Button { open(TicketRoute(id: ticket.id)) } label: {
            HStack(spacing: 10) {
                TicketCardView(ticket: ticket, showsPriority: showsPriority)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .accessibilityHint("Opens the ticket")
    }
}
