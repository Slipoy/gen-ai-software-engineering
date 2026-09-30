import Foundation

// Swift mirror of the backend's JSON contract (backend/src/models). `Codable` generates the JSON
// encoding and decoding; the API's snake_case keys map to camelCase properties automatically
// (see `JSONDecoder.api` in APIClient.swift), so `customer_email` becomes `customerEmail`.

enum Category: String, Codable, CaseIterable, Identifiable, Sendable {
    case accountAccess = "account_access"
    case technicalIssue = "technical_issue"
    case billingQuestion = "billing_question"
    case featureRequest = "feature_request"
    case bugReport = "bug_report"
    case other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .accountAccess: "Account access"
        case .technicalIssue: "Technical issue"
        case .billingQuestion: "Billing"
        case .featureRequest: "Feature request"
        case .bugReport: "Bug report"
        case .other: "Other"
        }
    }
}

enum Priority: String, Codable, CaseIterable, Identifiable, Sendable {
    case urgent, high, medium, low

    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

enum Status: String, Codable, CaseIterable, Identifiable, Sendable {
    case new
    case inProgress = "in_progress"
    case waitingCustomer = "waiting_customer"
    case resolved, closed

    var id: String { rawValue }

    var label: String {
        switch self {
        case .new: "New"
        case .inProgress: "In progress"
        case .waitingCustomer: "Waiting"
        case .resolved: "Resolved"
        case .closed: "Closed"
        }
    }

    /// Statuses that still need work; the queue shows these.
    static let open: [Status] = [.new, .inProgress, .waitingCustomer]
}

enum Source: String, Codable, CaseIterable, Sendable {
    case webForm = "web_form"
    case email, api, chat, phone

    var label: String {
        switch self {
        case .webForm: "Web form"
        case .email: "Email"
        case .api: "API"
        case .chat: "Chat"
        case .phone: "Phone"
        }
    }
}

enum DeviceType: String, Codable, CaseIterable, Sendable {
    case desktop, mobile, tablet
}

struct TicketMetadata: Codable, Hashable, Sendable {
    var source: Source
    var browser: String?
    var deviceType: DeviceType?
}

struct Classification: Codable, Hashable, Sendable {
    var category: Category
    var priority: Priority
    var confidence: Double
    var categoryConfidence: Double
    var priorityConfidence: Double
    var reasoning: String
    var keywordsFound: [String]
    var classifiedAt: Date?
}

struct Ticket: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var customerId: String
    var customerEmail: String
    var customerName: String
    var subject: String
    var description: String
    var category: Category
    var priority: Priority
    var status: Status
    var createdAt: Date
    var updatedAt: Date
    var resolvedAt: Date?
    var assignedTo: String?
    var tags: [String]
    var metadata: TicketMetadata
    var classification: Classification?
    var manualOverride: Bool
}

/// One entry of the backend's decision log (GET /tickets/:id/classifications).
struct ClassificationDecision: Codable, Identifiable, Hashable, Sendable {
    enum Actor: String, Codable, Sendable { case system, agent }

    let id: String
    var ticketId: String
    var at: Date
    var actor: Actor
    var action: String
    var category: Category
    var priority: Priority
    var previousCategory: Category
    var previousPriority: Priority
    var confidence: Double?
    var reasoning: String?
    var keywordsFound: [String]
    var applied: Bool
}

/// Response of POST /tickets/:id/auto-classify.
struct AutoClassifyOutcome: Codable, Sendable {
    var ticketId: String
    var category: Category
    var priority: Priority
    var confidence: Double
    var reasoning: String
    var keywordsFound: [String]
    var applied: Bool
    var ticket: Ticket
}

/// Response of POST /tickets/import.
struct ImportSummary: Codable, Sendable {
    struct Failure: Codable, Hashable, Sendable {
        var record: Int
        var location: String
        var errors: [FieldError]
    }

    struct FieldError: Codable, Hashable, Sendable {
        var field: String
        var message: String
    }

    var format: String
    var total: Int
    var successful: Int
    var failed: Int
    var createdIds: [String]
    var failures: [Failure]
}
