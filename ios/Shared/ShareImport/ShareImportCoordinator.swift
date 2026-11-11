import Foundation
import Observation

protocol ShareImportServicing {
    func accessToken() async throws -> String
    func loadSession() async throws -> ShareImportSessionSnapshot
    func grantConsent() async throws
    func submit(_ body: ShareImportSubmitBody) async throws -> String
    func status(_ requestId: String) async throws -> ShareImportJobSnapshot
    func confirm(_ requestId: String) async throws
}

@MainActor
@Observable
final class ShareImportCoordinator {
    private(set) var state: ShareImportState = .idle
    private(set) var trace: [String] = []
    private(set) var completionCount = 0
    private(set) var submitCount = 0
    private(set) var preparedHost: String?
    private(set) var preparedCost: Int?
    private var stopPolling = false
    private var service: ShareImportServicing?
    private var store: ShareImportStoring?
    private var record: ShareImportRecord?
    private var startedEpoch = 0
    private var maxPolls = 8
    private var sleepNanoseconds: @Sendable (UInt64) async -> Void = { nanoseconds in
        try? await Task.sleep(nanoseconds: nanoseconds)
    }

    var finishAllowed: Bool {
        switch state {
        case .idle, .preparing: false
        default: true
        }
    }

    func failClosed() {
        state = .failed("Could not save this share.")
    }

    var claimsSuccess: Bool {
        switch state {
        case .started, .readyToAdd, .addedToGalley, .progress: true
        default: false
        }
    }

    /// A timer must not close the extension. Only a tap on Done does.
    func noteTimerElapsed() {}

    func userRequestedFinish() -> Bool {
        guard finishAllowed else { return false }
        stopPolling = true
        completionCount += 1
        return true
    }

    func begin(
        url: URL,
        userText: String?,
        service: ShareImportServicing,
        store: ShareImportStoring,
        now: Date = Date(),
        maxPolls: Int = 8,
        sleep: @escaping @Sendable (UInt64) async -> Void = { nanoseconds in
            try? await Task.sleep(nanoseconds: nanoseconds)
        }
    ) async {
        self.service = service
        self.store = store
        self.maxPolls = maxPolls
        self.sleepNanoseconds = sleep
        startedEpoch = store.epoch
        let host = url.host ?? "this page"
        showPreparing(host: host, cost: nil)
        let clientRequestId = UUID().uuidString
        var created = ShareImportRecord(
            id: UUID().uuidString,
            clientRequestId: clientRequestId,
            url: url.absoluteString,
            userText: userText,
            savedAt: now.timeIntervalSince1970,
            state: "saved",
            sessionEpoch: startedEpoch
        )
        do {
            try store.insert(created)
        } catch SharedImportStoreError.full {
            state = .queueFull
            return
        } catch {
            state = .failed("Could not save this share.")
            return
        }
        record = created
        trace.append("persisted-id")
        guard epochStillValid() else {
            state = .signedOut
            return
        }
        do {
            _ = try await service.accessToken()
            let session = try await service.loadSession()
            guard epochStillValid() else {
                state = .signedOut
                return
            }
            created.ownerUserId = session.userId
            created.organizationId = session.organizationId
            created.organizationName = session.organizationName
            created.state = "bound"
            created.sessionEpoch = startedEpoch
            try store.update(created)
            record = created
            trace.append("bound")
            showPreparing(host: host, cost: session.importCost)
            guard epochStillValid() else {
                state = .signedOut
                return
            }
            guard ShareImportLane.isEnabled(url: url, session: session) else {
                state = .unavailable
                return
            }
            guard session.hasConsent else {
                state = .needsConsent
                return
            }
            guard session.credits >= session.importCost else {
                state = .needsCredits(required: session.importCost)
                return
            }
            await submitAndFollow(sessionCost: session.importCost)
        } catch let error as ShareImportServiceError {
            apply(error)
        } catch is URLError {
            state = .offline
        } catch {
            state = .failed("Could not start the import.")
        }
    }

    func allowAndImport() async {
        guard case .needsConsent = state else { return }
        guard let service, let record else { return }
        do {
            try await service.grantConsent()
            guard epochStillValid() else {
                state = .signedOut
                return
            }
            let session = try await service.loadSession()
            guard let url = URL(string: record.url),
                  ShareImportLane.isEnabled(url: url, session: session) else {
                state = .unavailable
                return
            }
            guard session.credits >= session.importCost else {
                state = .needsCredits(required: session.importCost)
                return
            }
            if let host = URL(string: record.url)?.host {
                showPreparing(host: host, cost: session.importCost)
            }
            await submitAndFollow(sessionCost: session.importCost)
        } catch let error as ShareImportServiceError {
            apply(error)
        } catch {
            state = .needsConsent
        }
    }

    func addToGalley() async {
        guard case .readyToAdd = state, let service, let requestId = record?.requestId ?? record?.clientRequestId else {
            return
        }
        guard epochStillValid() else {
            state = .signedOut
            return
        }
        do {
            guard epochStillValid() else {
                state = .signedOut
                return
            }
            try await service.confirm(requestId)
            guard epochStillValid() else {
                state = .signedOut
                return
            }
            record?.state = "confirmed"
            record?.acknowledged = true
            if let record { try? store?.update(record) }
            trace.append("ui:added")
            state = .addedToGalley
        } catch let error as ShareImportServiceError {
            apply(error)
        } catch {
            state = .failed("Could not add this recipe.")
        }
    }

    private func submitAndFollow(sessionCost: Int?) async {
        guard var record, let service, let store else { return }
        guard epochStillValid() else {
            state = .signedOut
            return
        }
        record.state = "submitting"
        do {
            try store.update(record)
        } catch {
            state = .failed("Could not save this share.")
            return
        }
        self.record = record
        trace.append("submitting")
        let body = ShareImportSubmitBody(
            clientRequestId: record.clientRequestId,
            url: record.url,
            userText: record.userText
        )
        let requestId: String
        do {
            requestId = try await submitOnce(body, service: service)
        } catch let error as ShareImportServiceError {
            apply(error, cost: sessionCost)
            return
        } catch {
            state = .failed("Could not start the import.")
            return
        }
        record.requestId = requestId
        record.state = "processing"
        do {
            try store.update(record)
        } catch {
            state = .failed("Could not save this share.")
            return
        }
        self.record = record
        trace.append("processing")
        trace.append("ui:started")
        state = .started
        await poll(requestId, service: service)
    }

    private func submitOnce(
        _ body: ShareImportSubmitBody,
        service: ShareImportServicing
    ) async throws -> String {
        do {
            submitCount += 1
            return try await service.submit(body)
        } catch ShareImportServiceError.timedOut {
            do {
                _ = try await service.status(body.clientRequestId)
                return body.clientRequestId
            } catch ShareImportServiceError.notFound {
                submitCount += 1
                return try await service.submit(body)
            }
        }
    }

    private func poll(_ requestId: String, service: ShareImportServicing) async {
        for attempt in 0..<maxPolls {
            if stopPolling { return }
            if attempt > 0 {
                await sleepNanoseconds(1_500_000_000)
            }
            if stopPolling { return }
            do {
                let job = try await service.status(requestId)
                if stopPolling { return }
                apply(job, requestId: requestId)
                switch state {
                case .progress, .started:
                    continue
                default:
                    return
                }
            } catch let error as ShareImportServiceError {
                apply(error)
                return
            } catch {
                state = .failed("Could not check the import.")
                return
            }
        }
    }

    private func apply(_ job: ShareImportJobSnapshot, requestId: String) {
        if job.code == "DUPLICATE_URL" {
            record?.state = "confirmed"
            record?.acknowledged = true
            if let record { try? store?.update(record) }
            state = .duplicate(name: job.existingMealName)
            return
        }
        if job.code == "SITE_BLOCKED" || job.code == "IMPORT_PROVIDER_UNAVAILABLE" {
            record?.state = "needsApp"
            record?.requestId = requestId
            if let record { try? store?.update(record) }
            state = .siteBlocked
            return
        }
        if let label = ShareImportProgressLabel.label(for: job.progress) {
            trace.append("ui:\(label)")
            state = .progress(label)
        }
        switch job.status {
        case "completed":
            if job.mealName != nil, !job.needsVerification {
                record?.state = "confirmed"
                record?.acknowledged = true
                if let record { try? store?.update(record) }
                trace.append("ui:added")
                state = .addedToGalley
            } else if job.needsVerification {
                state = .readyToAdd
            } else {
                state = .failed(job.error ?? "Import completed without a recipe.")
            }
        case "failed":
            record?.state = "failed"
            record?.acknowledged = true
            if let record { try? store?.update(record) }
            state = .failed(job.error ?? "Import failed.")
        default:
            if state != .progress(ShareImportProgressLabel.label(for: job.progress) ?? "") {
                if ShareImportProgressLabel.label(for: job.progress) == nil {
                    state = .started
                }
            }
        }
    }

    private func apply(_ error: ShareImportServiceError, cost: Int? = nil) {
        switch error {
        case .offline:
            state = .offline
        case .timedOut:
            state = .failed("Import is still processing. Open Ration from your Home Screen to check it.")
        case .unauthorized:
            state = .unauthorized
        case .rateLimited:
            state = .rateLimited
        case .notFound:
            state = .failed("Import is still processing. Open Ration from your Home Screen to check it.")
        case .duplicate(let name):
            record?.acknowledged = true
            if let record { try? store?.update(record) }
            state = .duplicate(name: name)
        case .unavailable:
            state = .unavailable
        case .insufficientCredits(let required):
            state = .needsCredits(required: required)
        case .failed(let message):
            state = .failed(message)
        case .siteBlocked:
            record?.state = "needsApp"
            if let record { try? store?.update(record) }
            state = .siteBlocked
        case .http:
            state = .failed("Could not start the import.")
        }
        _ = cost
    }

    private func showPreparing(host: String, cost: Int?) {
        preparedHost = host
        if let cost {
            preparedCost = cost
        }
        state = .preparing(host: host, cost: cost)
    }

    private func epochStillValid() -> Bool {
        store?.epoch == startedEpoch
    }
}
