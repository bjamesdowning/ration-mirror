import SwiftUI

struct DirectionsStepsView: View {
    let steps: [RecipeStep]
    @State private var completedPositions: Set<Int> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !steps.isEmpty {
                Text("\(completedPositions.count)/\(steps.count) steps done")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
            }

            ForEach(steps) { step in
                if let section = step.section, shouldShowSectionHeader(section, for: step) {
                    Text(section.uppercased())
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 4)
                }

                Button {
                    toggleStep(step.position)
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: completedPositions.contains(step.position) ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(completedPositions.contains(step.position) ? Theme.hyperGreen : Theme.muted)
                            .padding(.top, 2)
                        Text("\(step.position). \(step.text)")
                            .rationBody()
                            .foregroundStyle(completedPositions.contains(step.position) ? Theme.muted : Theme.carbon)
                            .strikethrough(completedPositions.contains(step.position))
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Step \(step.position): \(step.text)")
            }
        }
    }

    private func toggleStep(_ position: Int) {
        if completedPositions.contains(position) {
            completedPositions.remove(position)
        } else {
            completedPositions.insert(position)
        }
        Haptics.light()
    }

    private func shouldShowSectionHeader(_ section: String, for step: RecipeStep) -> Bool {
        guard let firstInSection = steps.first(where: { $0.section == section }) else { return false }
        return firstInSection.position == step.position
    }
}

struct DirectionsEditorView: View {
    @Binding var steps: [RecipeStep]

    var body: some View {
        ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
            VStack(alignment: .leading, spacing: 8) {
                TextField("Section (optional)", text: sectionBinding(index))
                    .font(Typography.caption())
                TextField("Step \(step.position)", text: textBinding(index), axis: .vertical)
                    .lineLimit(2...6)
            }
        }
        .onDelete(perform: deleteSteps)
        .onMove(perform: moveSteps)

        Button {
            addStep()
        } label: {
            Label("Add step", systemImage: "plus.circle")
        }
    }

    private func textBinding(_ index: Int) -> Binding<String> {
        Binding(
            get: { steps[index].text },
            set: { newValue in
                let section = steps[index].section
                steps[index] = RecipeStep(position: index + 1, text: newValue, section: section)
            }
        )
    }

    private func sectionBinding(_ index: Int) -> Binding<String> {
        Binding(
            get: { steps[index].section ?? "" },
            set: { newValue in
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                steps[index] = RecipeStep(
                    position: index + 1,
                    text: steps[index].text,
                    section: trimmed.isEmpty ? nil : trimmed
                )
            }
        )
    }

    private func addStep() {
        steps.append(RecipeStep(position: steps.count + 1, text: ""))
    }

    private func deleteSteps(at offsets: IndexSet) {
        steps.remove(atOffsets: offsets)
        reindexSteps()
    }

    private func moveSteps(from source: IndexSet, to destination: Int) {
        steps.move(fromOffsets: source, toOffset: destination)
        reindexSteps()
    }

    private func reindexSteps() {
        steps = steps.enumerated().map { index, step in
            RecipeStep(position: index + 1, text: step.text, section: step.section)
        }
    }
}
