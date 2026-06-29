import SwiftUI
import Observation

@MainActor
@Observable
final class ManifestViewModel {
    private(set) var manifest: ManifestResponse?
    private(set) var isLoading = false
    var errorMessage: String?
    var staleLabel: String?

    func load(api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        if online {
            do {
                let data = try await api.manifest()
                manifest = data
                snapshots.save(data, domain: SnapshotDomain.manifest, organizationId: nil)
            } catch {
                errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                restoreSnapshot(snapshots)
            }
        } else {
            restoreSnapshot(snapshots)
        }
        staleLabel = snapshots.lastSyncedLabel(domain: SnapshotDomain.manifest)
    }

    func consume(_ entry: ManifestEntry, api: RationAPI, snapshots: SnapshotStore, online: Bool) async {
        do {
            _ = try await api.consumeManifestEntries([entry.id])
            Haptics.success()
            await load(api: api, snapshots: snapshots, online: online)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func restoreSnapshot(_ snapshots: SnapshotStore) {
        if let cached = snapshots.load(ManifestResponse.self, domain: SnapshotDomain.manifest) {
            manifest = cached.payload
        }
    }
}

struct ManifestView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenSettings: () -> Void = {}
    @State private var model = ManifestViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading && model.manifest == nil {
                    LoadingView()
                } else if let manifest = model.manifest {
                    content(manifest)
                } else {
                    EmptyStateView(
                        icon: "calendar",
                        title: "Plan your next meal",
                        message: "Schedule meals from Galley to close your weekly loop."
                    )
                }
            }
            .navigationTitle("Manifest")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    ProfileToolbarButton(action: onOpenSettings)
                }
            }
            .background(Theme.ceramic)
        }
        .task {
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
        }
        .refreshable {
            await model.load(api: env.api, snapshots: env.snapshots, online: env.network.isOnline)
        }
    }

    private func content(_ manifest: ManifestResponse) -> some View {
        List {
            if let staleLabel = model.staleLabel {
                Text(staleLabel).rationCaption().listRowBackground(Color.clear)
            }
            if let errorMessage = model.errorMessage {
                ErrorBanner(message: errorMessage).listRowBackground(Color.clear)
            }

            let grouped = Dictionary(grouping: manifest.entries, by: \.date)
            ForEach(grouped.keys.sorted(), id: \.self) { date in
                Section(date) {
                    ForEach(grouped[date] ?? []) { entry in
                        ManifestEntryRow(entry: entry) {
                            Task {
                                await model.consume(
                                    entry,
                                    api: env.api,
                                    snapshots: env.snapshots,
                                    online: env.network.isOnline
                                )
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }
}

struct ManifestEntryRow: View {
    let entry: ManifestEntry
    let onConsume: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.mealName.capitalized).rationBody()
                Text("\(entry.slotType.capitalized) · \(entry.mealType.capitalized)")
                    .rationCaption()
            }
            Spacer()
            if entry.isConsumed {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(Theme.hyperGreen)
            } else {
                Button("Consume", action: onConsume)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.hyperGreen)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
