import Foundation
import Testing
@testable import SupportDesk

struct WordingTests {
    // `SupportDesk.Category`: Foundation also brings in an Objective-C type named `Category`.
    private func outcome(_ category: SupportDesk.Category, _ priority: Priority, applied: Bool, ticket: Ticket) -> AutoClassifyOutcome {
        AutoClassifyOutcome(
            ticketId: ticket.id, category: category, priority: priority, confidence: 0.8,
            reasoning: "", keywordsFound: [], applied: applied, ticket: ticket
        )
    }

    @Test func describesAClassifierRun() {
        let ticket = Fixtures.ticket()
        #expect(Wording.outcome(outcome(.accountAccess, .urgent, applied: true, ticket: ticket)) == "Classified as Account access · Urgent.")
        #expect(Wording.outcome(outcome(.accountAccess, .urgent, applied: false, ticket: ticket))
            == "The classifier agrees with the current Account access · Urgent.")
        #expect(Wording.outcome(outcome(.bugReport, .high, applied: false, ticket: ticket))
            == "The classifier suggests Bug report · High, but the manual choice was kept.")
    }

    @Test func describesDecisionLogEntries() {
        var decision = ClassificationDecision(
            id: "d1", ticketId: "t1", at: .now, actor: .system, action: "auto_classified",
            category: .bugReport, priority: .high, previousCategory: .other, previousPriority: .medium,
            confidence: 0.7, reasoning: nil, keywordsFound: [], applied: true
        )
        #expect(Wording.decision(decision) == "Classifier set Bug report · High")

        decision.applied = false
        #expect(Wording.decision(decision) == "Classifier suggested Bug report · High, manual choice kept")

        decision.previousCategory = .bugReport
        decision.previousPriority = .high
        #expect(Wording.decision(decision) == "Classifier agreed with Bug report · High")

        decision.actor = .agent
        #expect(Wording.decision(decision) == "An agent changed it to Bug report · High")
    }

    @Test func offersTheSuggestionOnlyAgainstAManualChoice() {
        #expect(!Wording.suggestionDiffers(Fixtures.ticket()))
        #expect(!Wording.suggestionDiffers(Fixtures.ticket { $0.manualOverride = true }))
        #expect(Wording.suggestionDiffers(Fixtures.ticket {
            $0.manualOverride = true
            $0.priority = .low
        }))
        #expect(!Wording.suggestionDiffers(Fixtures.ticket {
            $0.manualOverride = true
            $0.classification = nil
        }))
    }

    @Test func toastsMatchTheWebApp() {
        #expect(Wording.saved(["status": .string("closed")]) == "Ticket saved.")
        #expect(Wording.saved(["category": .string("other"), "priority": .string("low")])
            == "Saved. The category and priority you chose will not be overwritten by the classifier.")
        #expect(Wording.created(Fixtures.ticket()) == "Ticket created and classified as Account access · Urgent.")
        #expect(Wording.created(Fixtures.ticket { $0.classification = nil }) == "Ticket created as Account access · Urgent.")

        let summary = ImportSummary(format: "csv", total: 5, successful: 3, failed: 2, createdIds: [], failures: [])
        #expect(Wording.imported(summary) == "Imported 3 of 5 tickets; 2 need fixing.")
    }

    @Test func groupsTheQueueOldestFirst() {
        let old = Fixtures.ticket { $0 = Ticket(copying: $0, id: "old", createdAt: .distantPast) }
        let new = Fixtures.ticket { $0 = Ticket(copying: $0, id: "new", createdAt: .now) }
        let low = Fixtures.ticket {
            $0 = Ticket(copying: $0, id: "low", createdAt: .now)
            $0.priority = .low
        }
        let groups = [new, low, old].grouped()
        #expect(groups[.urgent]?.map(\.id) == ["old", "new"])
        #expect(groups[.low]?.map(\.id) == ["low"])
        #expect(groups[.high] == nil)
    }

    @Test func formatsAgesCompactly() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        #expect(Formatting.age(of: now.addingTimeInterval(-30), now: now) == "now")
        #expect(Formatting.age(of: now.addingTimeInterval(-8 * 60), now: now) == "8m")
        #expect(Formatting.age(of: now.addingTimeInterval(-3 * 3600), now: now) == "3h")
        #expect(Formatting.age(of: now.addingTimeInterval(-2 * 86_400), now: now) == "2d")
    }
}

private extension Ticket {
    /// `id` is a `let`, so tests that need several distinct tickets rebuild one with a new id.
    init(copying other: Ticket, id: String, createdAt: Date) {
        self = Ticket(
            id: id, customerId: other.customerId, customerEmail: other.customerEmail, customerName: other.customerName,
            subject: other.subject, description: other.description, category: other.category, priority: other.priority,
            status: other.status, createdAt: createdAt, updatedAt: other.updatedAt, resolvedAt: other.resolvedAt,
            assignedTo: other.assignedTo, tags: other.tags, metadata: other.metadata,
            classification: other.classification, manualOverride: other.manualOverride
        )
    }
}
