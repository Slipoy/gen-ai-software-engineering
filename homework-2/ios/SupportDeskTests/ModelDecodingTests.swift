import Foundation
import Testing
@testable import SupportDesk

/// Swift Testing: `@Test` marks a test, `#expect` checks a condition (like `expect` in Vitest).
struct ModelDecodingTests {
    /// A ticket exactly as the backend returns it (snake_case keys, ISO dates with milliseconds).
    let json = """
    {
      "id": "6f1d8b4e-0000-4000-8000-000000000001",
      "customer_id": "CSV-0001",
      "customer_email": "yuki.fischer@northwind.example",
      "customer_name": "Yuki Fischer",
      "subject": "Cannot log in after password reset",
      "description": "The login page rejects my password.",
      "category": "account_access",
      "priority": "urgent",
      "status": "in_progress",
      "created_at": "2026-09-30T19:10:00.123Z",
      "updated_at": "2026-09-30T19:12:00.000Z",
      "resolved_at": null,
      "assigned_to": "agent.jones",
      "tags": ["login", "password"],
      "metadata": { "source": "web_form", "browser": "Chrome 128", "device_type": "desktop" },
      "classification": {
        "category": "account_access", "priority": "urgent", "confidence": 0.95,
        "category_confidence": 0.99, "priority_confidence": 0.9,
        "reasoning": "Categorized as account_access (score 8).", "keywords_found": ["log in", "password reset"],
        "classified_at": "2026-09-30T19:10:00.200Z"
      },
      "manual_override": false
    }
    """

    @Test func decodesATicketFromTheAPI() throws {
        let ticket = try JSONDecoder.api.decode(Ticket.self, from: Data(json.utf8))

        #expect(ticket.customerEmail == "yuki.fischer@northwind.example")
        #expect(ticket.category == .accountAccess)
        #expect(ticket.status == .inProgress)
        #expect(ticket.metadata.deviceType == .desktop)
        #expect(ticket.classification?.keywordsFound == ["log in", "password reset"])
        #expect(ticket.resolvedAt == nil)
        #expect(ticket.createdAt == ISO8601.withFraction.date(from: "2026-09-30T19:10:00.123Z"))
    }

    @Test func decodesATicketThatWasNeverClassified() throws {
        let unclassified = json
            .replacingOccurrences(of: #""classification": \{[^}]*\}"#, with: #""classification": null"#, options: .regularExpression)
        let ticket = try JSONDecoder.api.decode(Ticket.self, from: Data(unclassified.utf8))
        #expect(ticket.classification == nil)
    }

    @Test func rejectsAnUnknownEnumValue() {
        // "archived" is not a status the app knows: decoding must fail loudly instead of guessing.
        let broken = json.replacingOccurrences(of: #""status": "in_progress""#, with: #""status": "archived""#)
        #expect(broken != json)
        #expect(throws: DecodingError.self) {
            try JSONDecoder.api.decode(Ticket.self, from: Data(broken.utf8))
        }
    }

    @Test(arguments: Priority.allCases)
    func everyPriorityHasALabel(priority: Priority) {
        #expect(!priority.label.isEmpty)
    }

    @Test func openStatusesMatchTheWebQueue() {
        #expect(Status.open == [.new, .inProgress, .waitingCustomer])
    }
}
