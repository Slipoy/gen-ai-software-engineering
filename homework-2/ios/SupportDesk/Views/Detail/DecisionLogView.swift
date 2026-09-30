import SwiftUI

/// Who decided the category and priority, and when: the backend's decision log, newest first.
struct DecisionLogView: View {
    /// nil while loading or when it could not be loaded.
    let decisions: [ClassificationDecision]?

    var body: some View {
        if let decisions {
            if decisions.isEmpty {
                Text("No decisions yet.").font(.footnote).foregroundStyle(Theme.textMuted)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(decisions.reversed()) { decision in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Image(systemName: decision.actor == .agent ? "person.fill" : "cpu")
                                .font(.caption)
                                .foregroundStyle(decision.actor == .agent ? Theme.accentText : Theme.textMuted)
                                .frame(width: 16)
                            VStack(alignment: .leading, spacing: 2) {
                                Group {
                                    Text(Wording.decision(decision))
                                        + Text(decision.confidence.map { " (\(Formatting.confidence($0)))" } ?? "")
                                        .foregroundStyle(Theme.textMuted)
                                }
                                .font(.footnote)
                                .foregroundStyle(Theme.textSecondary)
                                Text(Formatting.dateTime(decision.at))
                                    .font(.mono(.caption2))
                                    .foregroundStyle(Theme.textMuted)
                            }
                        }
                    }
                }
            }
        } else {
            Text("Loading…").font(.footnote).foregroundStyle(Theme.textMuted)
        }
    }
}
