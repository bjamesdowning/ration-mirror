import Foundation
import Observation

@MainActor
@Observable
final class GenerateMealViewModel {
    enum State {
        case idle
        case submitting
        case processing(requestId: String)
        case completed([GeneratedRecipe])
        case failed(String)
    }

    private(set) var state: State = .idle
    var customization = ""
    var shouldShowPaywall = false
    private var activeTask: Task<Void, Never>?
    private var submissionGeneration = 0

    func cancelActiveWork() {
        submissionGeneration += 1
        activeTask?.cancel()
        activeTask = nil
    }

    func submit(api: RationAPI, session: SessionStore) {
        cancelActiveWork()
        let generation = submissionGeneration
        shouldShowPaywall = false
        state = .submitting
        activeTask = Task {
            do {
                let response = try await api.generateMeal(
                    GenerateMealRequest(customization: customization.isEmpty ? nil : customization)
                )
                guard isCurrent(generation) else { return }
                guard let requestId = response.requestId else {
                    state = .failed("Generation started but no request id was returned.")
                    return
                }
                Haptics.light()
                state = .processing(requestId: requestId)
                Task { await AIErrorHandling.refreshCredits(session: session, api: api) }
                await poll(requestId: requestId, api: api, generation: generation)
            } catch is CancellationError {
                return
            } catch {
                guard isCurrent(generation) else { return }
                if AIErrorHandling.mapSubmitError(error) == .paywall {
                    shouldShowPaywall = true
                    state = .idle
                } else if AIErrorHandling.mapSubmitError(error) == .featureDisabled {
                    state = .failed(AIErrorHandling.featureDisabledMessage)
                } else {
                    state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                }
            }
        }
    }

    func saveSelected(_ recipes: [GeneratedRecipe], api: RationAPI) async throws {
        for recipe in recipes {
            let steps = DirectionsParser.parseDirections(recipe.directions)
            let directionsPayload = steps.isEmpty ? recipe.directions : DirectionsParser.serializeDirections(steps)
            let body = CreateMealRequest(
                name: recipe.name.lowercased(),
                description: recipe.description,
                directions: directionsPayload,
                servings: recipe.servings ?? 2,
                prepTime: recipe.prepTime,
                cookTime: recipe.cookTime,
                ingredients: recipe.ingredients ?? [],
                tags: recipe.tags ?? []
            )
            _ = try await api.createMeal(body)
        }
    }

    func poll(requestId: String, api: RationAPI, generation: Int) async {
        let poller = AIJobPoller<GenerateMealStatusResponse>(
            fetchStatus: { try await api.generateMealStatus(requestId: $0) },
            interpretStatus: { result in
                switch result.status {
                case "completed": .completed
                case "failed": .failed(result.error ?? "Generation failed.")
                default: .running
                }
            }
        )
        do {
            let result = try await poller.poll(requestId: requestId)
            guard isCurrent(generation) else { return }
            state = .completed(result.recipes ?? [])
        } catch is CancellationError {
            return
        } catch AIJobPollError.timedOut {
            guard isCurrent(generation) else { return }
            state = .failed("Generation is still processing. Check Galley shortly.")
        } catch let AIJobPollError.failed(message) {
            guard isCurrent(generation) else { return }
            state = .failed(message)
        } catch {
            guard isCurrent(generation) else { return }
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func reset() {
        cancelActiveWork()
        state = .idle
        shouldShowPaywall = false
    }

    private func isCurrent(_ generation: Int) -> Bool {
        !Task.isCancelled && generation == submissionGeneration
    }
}
