import SwiftUI

/// The classifier's latest suggestion with confidence, reasoning and keywords, plus the actions
/// (ClassificationCard.tsx on the web). When an agent has set category/priority by hand, the suggestion
/// is shown but not applied, and "Apply suggestion" forces it.
struct ClassificationCardView: View {
    let ticket: Ticket

    @Environment(AppState.self) private var app
    @State private var isRunning = false
    @State private var feedback: Feedback?

    /// The message after a run, and the category/priority it talks about.
    private struct Feedback: Equatable {
        let text: String
        let isError: Bool
        var category: Category?
        var priority: Priority?
    }

    /// The message only while the ticket is still in the state it describes: after an edit,
    /// "the classifier agrees with the current …" would no longer be true.
    private var visibleFeedback: Feedback? {
        guard let feedback else { return nil }
        if feedback.isError { return feedback }
        return feedback.category == ticket.category && feedback.priority == ticket.priority ? feedback : nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: "Auto-classification")

            if let result = ticket.classification {
                HStack(spacing: 14) {
                    ConfidenceRingView(value: result.confidence)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Classifier suggests").font(.caption).foregroundStyle(Theme.textMuted)
                        Text(Wording.pair(result.category, result.priority))
                            .font(.headline)
                            .foregroundStyle(Theme.text)
                        Text("category \(Formatting.confidence(result.categoryConfidence)) · priority \(Formatting.confidence(result.priorityConfidence))")
                            .font(.mono(.caption2))
                            .foregroundStyle(Theme.textMuted)
                    }
                }

                Text(result.reasoning)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)

                if !result.keywordsFound.isEmpty {
                    FlowLayout {
                        ForEach(result.keywordsFound, id: \.self) { Chip(text: $0, color: Theme.accentText, mono: true) }
                    }
                    .accessibilityLabel("Keywords found: \(result.keywordsFound.joined(separator: ", "))")
                }

                if Wording.suggestionDiffers(ticket) {
                    Text("An agent set this ticket to \(Wording.pair(ticket.category, ticket.priority)). Their choice is kept until you apply the suggestion.")
                        .font(.footnote)
                        .foregroundStyle(Theme.accentText)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                }

                if let at = result.classifiedAt {
                    Text("Last run \(Formatting.dateTime(at))").font(.caption).foregroundStyle(Theme.textMuted)
                }
            } else {
                Text("This ticket has not been classified yet.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
            }

            HStack(spacing: 10) {
                Button {
                    Task { await run(force: false) }
                } label: {
                    Text(isRunning ? "Classifying…" : ticket.classification == nil ? "Classify" : "Re-classify")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .foregroundStyle(Theme.onAccent)

                if Wording.suggestionDiffers(ticket) {
                    Button {
                        Task { await run(force: true) }
                    } label: {
                        Text("Apply suggestion").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
            .disabled(isRunning)
            .controlSize(.large)

            if let feedback = visibleFeedback {
                Text(feedback.text)
                    .font(.footnote)
                    .foregroundStyle(feedback.isError ? Theme.danger : Theme.success)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.surface2, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border))
        .animation(.easeOut(duration: 0.2), value: visibleFeedback)
        // Another ticket shown in the same view: forget the message about the previous one.
        .onChange(of: ticket.id) { feedback = nil }
    }

    private func run(force: Bool) async {
        isRunning = true
        defer { isRunning = false }
        do {
            let outcome = try await app.api.autoClassify(id: ticket.id, force: force)
            feedback = Feedback(
                text: Wording.outcome(outcome), isError: false,
                category: outcome.ticket.category, priority: outcome.ticket.priority
            )
            // The ticket and its decision log changed: every screen showing them reloads.
            app.ticketsChanged()
        } catch {
            feedback = Feedback(text: APIError.from(error).message, isError: true)
        }
    }
}

/// Circular 0–1 gauge for the classifier's confidence, coloured by level like the web ring.
struct ConfidenceRingView: View {
    let value: Double

    private var clamped: Double { min(max(value, 0), 1) }

    private var color: Color {
        clamped >= 0.75 ? Theme.success : clamped >= 0.5 ? Theme.accent : Theme.danger
    }

    var body: some View {
        ZStack {
            Circle().stroke(Theme.surface3, lineWidth: 6)
            Circle()
                .trim(from: 0, to: clamped)
                .stroke(color, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                // A circle's path starts at 3 o'clock; turn it so the gauge fills from 12 o'clock.
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text(Formatting.confidence(clamped))
                    .font(.mono(.subheadline).weight(.semibold))
                    .foregroundStyle(Theme.text)
                Text("conf.")
                    .font(.system(size: 9))
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .frame(width: 64, height: 64)
        .animation(.easeOut(duration: 0.4), value: clamped)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Confidence \(Formatting.confidence(clamped))")
    }
}
