import Foundation
@testable import SupportDesk

/// Test data shared by the suites: one realistic ticket, tweaked per test.
enum Fixtures {
    static func ticket(_ change: (inout Ticket) -> Void = { _ in }) -> Ticket {
        var ticket = Ticket(
            id: "6f1d8b4e-0000-4000-8000-000000000001",
            customerId: "CSV-0001",
            customerEmail: "yuki.fischer@northwind.example",
            customerName: "Yuki Fischer",
            subject: "Cannot log in after password reset",
            description: "The login page rejects my password.",
            category: .accountAccess,
            priority: .urgent,
            status: .inProgress,
            createdAt: Date(timeIntervalSince1970: 1_790_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_790_000_100),
            resolvedAt: nil,
            assignedTo: "agent.jones",
            tags: ["login", "password"],
            metadata: TicketMetadata(source: .webForm, browser: "Chrome 128", deviceType: .desktop),
            classification: Classification(
                category: .accountAccess, priority: .urgent, confidence: 0.95,
                categoryConfidence: 0.99, priorityConfidence: 0.9,
                reasoning: "Categorized as account_access (score 8).",
                keywordsFound: ["log in", "password reset"], classifiedAt: nil
            ),
            manualOverride: false
        )
        change(&ticket)
        return ticket
    }

    /// Form values that pass every rule.
    static func validForm() -> TicketFormValues {
        var values = TicketFormValues()
        values.customerName = "Jane Doe"
        values.customerEmail = "jane@example.com"
        values.customerId = "CUST-001"
        values.subject = "Cannot log in"
        values.description = "The login page says my password is wrong."
        return values
    }

    /// JSONValue → a plain dictionary/array tree, so tests can compare bodies without caring about key order.
    static func decoded(_ value: JSONValue) throws -> Any {
        let data = try JSONEncoder().encode(value)
        return try JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)
    }
}
