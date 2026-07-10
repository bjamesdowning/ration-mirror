import UIKit

/// CPU-heavy image resize/compression off the main actor.
enum ScanImageProcessor {
    /// `CGImage` is immutable; the wrapper documents the intentional
    /// cross-actor transfer while preserving UIImage orientation metadata.
    private struct Source: @unchecked Sendable {
        let image: CGImage
        let scale: CGFloat
        let orientation: UIImage.Orientation
    }

    @MainActor
    static func resizedJPEG(
        from image: UIImage,
        maxDimension: CGFloat = 1024,
        quality: CGFloat = 0.7
    ) async throws -> Data? {
        guard let cgImage = image.cgImage else { return nil }
        let source = Source(image: cgImage, scale: image.scale, orientation: image.imageOrientation)
        let task = Task.detached(priority: .userInitiated) {
            try Task.checkCancellation()
            let sourceImage = UIImage(
                cgImage: source.image,
                scale: source.scale,
                orientation: source.orientation
            )
            let result = sourceImage.resizedJPEG(maxDimension: maxDimension, quality: quality)
            try Task.checkCancellation()
            return result
        }
        return try await withTaskCancellationHandler {
            try await task.value
        } onCancel: {
            task.cancel()
        }
    }
}

extension UIImage {
    nonisolated func resizedJPEG(maxDimension: CGFloat, quality: CGFloat) -> Data? {
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
