import SwiftUI

/// A filter button that opens a menu of checkable options (MultiSelect.tsx on the web).
/// The menu stays open while ticking options, and the button shows how many are picked.
struct MultiSelectMenu<Option: Hashable & Identifiable>: View {
    let title: String
    let options: [Option]
    let label: (Option) -> String
    @Binding var selection: Set<Option>

    var body: some View {
        Menu {
            ForEach(options) { option in
                Button {
                    if selection.contains(option) { selection.remove(option) } else { selection.insert(option) }
                } label: {
                    if selection.contains(option) {
                        Label(label(option), systemImage: "checkmark")
                    } else {
                        Text(label(option))
                    }
                }
            }
            if !selection.isEmpty {
                Divider()
                Button("Clear", role: .destructive) { selection.removeAll() }
            }
        } label: {
            HStack(spacing: 4) {
                Text(selection.isEmpty ? title : "\(title) · \(selection.count)")
                Image(systemName: "chevron.down").font(.caption2.weight(.bold))
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(selection.isEmpty ? Theme.textSecondary : Theme.onAccent)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(selection.isEmpty ? Theme.surface3 : Theme.accent, in: Capsule())
            .overlay(Capsule().stroke(selection.isEmpty ? Theme.border : .clear))
        }
        .menuActionDismissBehavior(.disabled)
        .accessibilityLabel(selection.isEmpty ? "\(title) filter" : "\(title) filter, \(selection.count) selected")
    }
}
