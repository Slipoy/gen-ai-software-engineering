import Foundation

/// Sentences the UI shows about classification, kept out of the views so tests can check them.
/// Same wording as ClassificationCard.tsx and DecisionLog.tsx on the web.
enum Wording {
    static func pair(_ category: Category, _ priority: Priority) -> String {
        "\(category.label) · \(priority.label)"
    }

    /// One sentence about the last classifier run, shown after the agent presses a button.
    static func outcome(_ outcome: AutoClassifyOutcome) -> String {
        let result = pair(outcome.category, outcome.priority)
        if outcome.applied { return "Classified as \(result)." }
        let agrees = outcome.category == outcome.ticket.category && outcome.priority == outcome.ticket.priority
        return agrees
            ? "The classifier agrees with the current \(result)."
            : "The classifier suggests \(result), but the manual choice was kept."
    }

    /// One line of the decision log.
    static func decision(_ decision: ClassificationDecision) -> String {
        let to = pair(decision.category, decision.priority)
        if decision.actor == .agent { return "An agent changed it to \(to)" }
        if decision.applied { return "Classifier set \(to)" }
        let agrees = decision.category == decision.previousCategory && decision.priority == decision.previousPriority
        return agrees ? "Classifier agreed with \(to)" : "Classifier suggested \(to), manual choice kept"
    }

    /// Did an agent pick a category/priority that the classifier disagrees with? Then "Apply suggestion" is offered.
    static func suggestionDiffers(_ ticket: Ticket) -> Bool {
        guard ticket.manualOverride, let result = ticket.classification else { return false }
        return result.category != ticket.category || result.priority != ticket.priority
    }
}

extension Array where Element == Ticket {
    /// Queue order inside one priority: oldest first, because the one waiting longest is next in line.
    func grouped() -> [Priority: [Ticket]] {
        Dictionary(grouping: self, by: \.priority).mapValues { $0.sorted { $0.createdAt < $1.createdAt } }
    }
}

extension Wording {
    static func created(_ ticket: Ticket) -> String {
        let how = ticket.classification != nil && !ticket.manualOverride ? " and classified as " : " as "
        return "Ticket created\(how)\(pair(ticket.category, ticket.priority))."
    }

    /// Toast after saving an edit. `changes` is the PUT body, so we know what the agent picked by hand.
    static func saved(_ changes: [String: JSONValue]) -> String {
        let chosen = ["category", "priority"].filter { changes[$0] != nil }.joined(separator: " and ")
        return chosen.isEmpty ? "Ticket saved." : "Saved. The \(chosen) you chose will not be overwritten by the classifier."
    }

    static func imported(_ summary: ImportSummary) -> String {
        summary.failed == 0
            ? "Imported all \(summary.successful) tickets."
            : "Imported \(summary.successful) of \(summary.total) tickets; \(summary.failed) need fixing."
    }
}
