import SwiftUI
import UIKit
import Observation

@MainActor
@Observable
final class ScanViewModel {
    enum State {
        case idle
        case uploading
        case processing(requestId: String)
        case completed(requestId: String, items: [ScanResultItem])
        case failed(String)
    }

    private(set) var state: State = .idle
    private let maxPollAttempts = 80
    private let pollDelayNanoseconds: UInt64 = 1_500_000_000

    func submit(image: UIImage, api: RationAPI) async {
        state = .uploading
        guard let data = image.resizedJPEG(maxDimension: 1024, quality: 0.7) else {
            state = .failed("Could not process the image.")
            return
        }
        do {
            let response = try await api.submitScan(imageData: data)
            guard let requestId = response.requestId else {
                state = .failed("Scan was submitted but no request id was returned.")
                return
            }
            state = .processing(requestId: requestId)
            await poll(requestId: requestId, api: api)
        } catch {
            state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func poll(requestId: String, api: RationAPI) async {
        for attempt in 0..<maxPollAttempts {
            do {
                try await Task.sleep(nanoseconds: pollDelayNanoseconds)
                let result = try await api.scanStatus(requestId: requestId)
                switch result.status {
                case "completed":
                    state = .completed(requestId: requestId, items: result.items ?? [])
                    return
                case "failed":
                    state = .failed(result.error ?? "Scan failed. Please try again.")
                    return
                default:
                    state = .processing(requestId: requestId)
                }
            } catch is CancellationError {
                return
            } catch {
                if let apiError = error as? APIError,
                   [429, 503].contains(apiError.statusCode ?? 0),
                   attempt < maxPollAttempts - 1
                {
                    state = .processing(requestId: requestId)
                    continue
                }
                state = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
                return
            }
        }
        state = .failed("Scan is still processing. Pull Cargo to refresh shortly.")
    }

    func reset() { state = .idle }
}

struct ScanView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model = ScanViewModel()
    @State private var showingCamera = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                switch model.state {
                case .idle:
                    EmptyStateView(
                        icon: "camera.viewfinder",
                        title: "Scan a receipt",
                        message: "Capture a grocery receipt and Ration adds the items to your cargo automatically."
                    )
                    Button("Open camera") { showingCamera = true }
                        .buttonStyle(PrimaryButtonStyle())
                        .padding(.horizontal, 24)

                case .uploading:
                    LoadingView(label: "Uploading scan…")

                case let .processing(requestId):
                    GlassCard {
                        VStack(spacing: 12) {
                            ProgressView().tint(Theme.hyperGreen)
                            Text("Processing scan").rationHeadline()
                            Text("Request \(requestId) is extracting cargo. This usually takes a few seconds.")
                                .rationCaption()
                                .multilineTextAlignment(.center)
                        }
                    }
                    .padding(24)

                case let .completed(requestId, items):
                    ScrollView {
                        VStack(spacing: 16) {
                            GlassCard {
                                VStack(spacing: 8) {
                                    Image(systemName: "checkmark.seal.fill")
                                        .font(.system(size: 36))
                                        .foregroundStyle(Theme.hyperGreen)
                                    Text("Scan complete").rationHeadline()
                                    Text("Request \(requestId) returned \(items.count) item\(items.count == 1 ? "" : "s").")
                                        .rationCaption()
                                        .multilineTextAlignment(.center)
                                }
                            }
                            if items.isEmpty {
                                EmptyStateView(icon: "doc.text.magnifyingglass", title: "No items found", message: "Try a clearer receipt photo or add cargo manually.")
                            } else {
                                ForEach(items) { item in
                                    GlassCard {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(item.name.capitalized).rationBody()
                                                if let domain = item.domain {
                                                    Text(domain.capitalized).rationCaption()
                                                }
                                            }
                                            Spacer()
                                            Text("\(item.quantity.formatted()) \(item.unit)")
                                                .rationCaption()
                                        }
                                    }
                                }
                            }
                            Button("Scan another") { model.reset() }
                                .buttonStyle(SecondaryButtonStyle())
                        }
                        .padding(16)
                    }

                case let .failed(message):
                    VStack(spacing: 16) {
                        ErrorBanner(message: message)
                        Button("Try again") { model.reset() }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                    .padding(24)
                }
            }
            .frame(maxHeight: .infinity)
            .navigationTitle("Scan")
            .background(Theme.ceramic)
            .fullScreenCover(isPresented: $showingCamera) {
                CameraPicker { image in
                    showingCamera = false
                    if let image { Task { await model.submit(image: image, api: env.api) } }
                }
                .ignoresSafeArea()
            }
        }
    }
}

/// UIKit camera bridge — keeps the MVP dependency-free. Vision-based document
/// edge detection is a later enhancement (Stream E).
struct CameraPicker: UIViewControllerRepresentable {
    let onResult: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onResult: onResult) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onResult: (UIImage?) -> Void
        init(onResult: @escaping (UIImage?) -> Void) { self.onResult = onResult }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            onResult(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onResult(nil)
        }
    }
}

extension UIImage {
    /// Downscales to `maxDimension` (longest edge) and encodes JPEG — mirrors the
    /// web `CameraInput` resize so uploads stay small on cellular.
    func resizedJPEG(maxDimension: CGFloat, quality: CGFloat) -> Data? {
        let longest = max(size.width, size.height)
        let scale = longest > maxDimension ? maxDimension / longest : 1
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
        let resized = renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: newSize))
        }
        return resized.jpegData(compressionQuality: quality)
    }
}
