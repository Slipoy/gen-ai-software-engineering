import Foundation

/// What the ticket form edits, plus the rules and conversions around it. Mirrors
/// frontend/src/lib/validation.ts and the backend validator: instant feedback here, and the
/// server still has the final word (its field errors are shown the same way).
struct TicketFormValues: Equatable, Sendable {
    enum Field: String, CaseIterable, Sendable {
        case customerName = "customer_name"
        case customerEmail = "customer_email"
        case customerId = "customer_id"
        case subject, description
        case assignedTo = "assigned_to"
        case tags
        case browser
    }

    var customerName = ""
    var customerEmail = ""
    var customerId = ""
    var subject = ""
    var description = ""
    /// nil = let the classifier decide (create only).
    var category: Category?
    var priority: Priority?
    var status: Status = .new
    var assignedTo = ""
    /// Comma-separated, e.g. "login, vip".
    var tags = ""
    var source: Source = .webForm
    var browser = ""
    var deviceType: DeviceType?

    init() {}

    init(ticket: Ticket) {
        customerName = ticket.customerName
        customerEmail = ticket.customerEmail
        customerId = ticket.customerId
        subject = ticket.subject
        description = ticket.description
        category = ticket.category
        priority = ticket.priority
        status = ticket.status
        assignedTo = ticket.assignedTo ?? ""
        tags = ticket.tags.joined(separator: ", ")
        source = ticket.metadata.source
        browser = ticket.metadata.browser ?? ""
        deviceType = ticket.metadata.deviceType
    }

    // MARK: - Validation

    static let limits: [Field: (min: Int, max: Int)] = [
        .customerName: (1, 100), .customerId: (1, 100), .subject: (1, 200), .description: (10, 2000),
        .assignedTo: (0, 100), .browser: (0, 100),
    ]

    /// A pragmatic email check, the same as the backend: something@something.tld without spaces.
    /// Computed, not stored: Regex is not Sendable, so Swift 6 forbids sharing one static instance.
    private static var emailPattern: Regex<Substring> { /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/ }

    private static let labels: [Field: String] = [
        .customerName: "Name", .customerId: "Customer ID", .subject: "Subject", .description: "Description",
        .assignedTo: "Assignee", .browser: "Browser",
    ]

    func text(for field: Field) -> String {
        switch field {
        case .customerName: customerName
        case .customerEmail: customerEmail
        case .customerId: customerId
        case .subject: subject
        case .description: description
        case .assignedTo: assignedTo
        case .tags: tags
        case .browser: browser
        }
    }

    /// Field → message for every rule that is broken. Empty means the form is valid.
    func validate() -> [Field: String] {
        var errors: [Field: String] = [:]
        for (field, limit) in Self.limits {
            let length = text(for: field).trimmingCharacters(in: .whitespacesAndNewlines).count
            let label = Self.labels[field]!
            if limit.min > 0 && length == 0 {
                errors[field] = "\(label) is required"
            } else if length < limit.min {
                errors[field] = "\(label) must be at least \(limit.min) characters (now \(length))"
            } else if length > limit.max {
                errors[field] = "\(label) must be at most \(limit.max) characters (now \(length))"
            }
        }

        let email = customerEmail.trimmingCharacters(in: .whitespaces)
        if email.isEmpty {
            errors[.customerEmail] = "Email is required"
        } else if email.count > 254 {
            errors[.customerEmail] = "Email must be at most 254 characters"
        } else if email.wholeMatch(of: Self.emailPattern) == nil {
            errors[.customerEmail] = "Enter an email like name@example.com"
        }

        let tagList = Self.parseTags(tags)
        if tagList.count > 20 {
            errors[.tags] = "At most 20 tags"
        } else if tagList.contains(where: { $0.count > 50 }) {
            errors[.tags] = "Each tag must be at most 50 characters"
        }
        return errors
    }

    /// "Login, VIP,, login " → ["login", "vip"], matching how the backend normalises tags.
    static func parseTags(_ text: String) -> [String] {
        var seen = Set<String>()
        return text.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    /// Maps a server error field ("metadata.browser", "tags[2]") to the form field that shows it.
    static func field(forServerField name: String) -> Field? {
        let cleaned = name.replacing(/^metadata\./, with: "").replacing(/\[\d+\]$/, with: "")
        return Field(rawValue: cleaned)
    }

    // MARK: - Request bodies

    private func trimmed(_ text: String) -> String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Body of POST /tickets. No category/priority means "let the server/classifier decide".
    func createBody() -> JSONValue {
        var body: [String: JSONValue] = [
            "customer_name": .string(trimmed(customerName)),
            "customer_email": .string(trimmed(customerEmail)),
            "customer_id": .string(trimmed(customerId)),
            "subject": .string(trimmed(subject)),
            "description": .string(trimmed(description)),
            "status": .string(status.rawValue),
            "assigned_to": .optional(trimmed(assignedTo)),
            "tags": .array(Self.parseTags(tags).map(JSONValue.string)),
            "metadata": .object([
                "source": .string(source.rawValue),
                "browser": .optional(trimmed(browser)),
                "device_type": .optional(deviceType?.rawValue),
            ]),
        ]
        if let category { body["category"] = .string(category.rawValue) }
        if let priority { body["priority"] = .string(priority.rawValue) }
        return .object(body)
    }

    /// Body of PUT /tickets/:id with only the fields that changed. This matters: a category or priority
    /// in the body counts as a manual override on the server, so unchanged ones must not be sent.
    func updateBody(comparedTo ticket: Ticket) -> [String: JSONValue] {
        var changes: [String: JSONValue] = [:]
        func compare(_ key: String, _ new: String, _ old: String) {
            if new != old { changes[key] = .string(new) }
        }
        compare("customer_name", trimmed(customerName), ticket.customerName)
        if trimmed(customerEmail).lowercased() != ticket.customerEmail { changes["customer_email"] = .string(trimmed(customerEmail)) }
        compare("customer_id", trimmed(customerId), ticket.customerId)
        compare("subject", trimmed(subject), ticket.subject)
        compare("description", trimmed(description), ticket.description)
        if let category, category != ticket.category { changes["category"] = .string(category.rawValue) }
        if let priority, priority != ticket.priority { changes["priority"] = .string(priority.rawValue) }
        if status != ticket.status { changes["status"] = .string(status.rawValue) }
        if trimmed(assignedTo) != (ticket.assignedTo ?? "") { changes["assigned_to"] = .optional(trimmed(assignedTo)) }
        let tagList = Self.parseTags(tags)
        if tagList != ticket.tags { changes["tags"] = .array(tagList.map(JSONValue.string)) }

        var metadata: [String: JSONValue] = [:]
        if source != ticket.metadata.source { metadata["source"] = .string(source.rawValue) }
        if trimmed(browser) != (ticket.metadata.browser ?? "") { metadata["browser"] = .optional(trimmed(browser)) }
        if deviceType != ticket.metadata.deviceType { metadata["device_type"] = .optional(deviceType?.rawValue) }
        if !metadata.isEmpty { changes["metadata"] = .object(metadata) }
        return changes
    }
}
